require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { criarToken, autenticar, apenasAdmin } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Só os ficheiros do site são públicos (nunca o código do servidor, package.json, node_modules...)
const FICHEIROS_PUBLICOS = new Set([
  '/', '/index.html', '/script.js', '/style.css', '/sw.js', '/manifest.json',
  '/logo.png', '/logo-192.png', '/logo-512.png', '/fundo.jpg'
]);
app.use((req, res, next) => (FICHEIROS_PUBLICOS.has(req.path) ? express.static(__dirname)(req, res, next) : next()));

// Ligação ao Supabase (credenciais no ficheiro .env)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Multer guarda temporariamente os ficheiros em memória; só aceita PNG e DST até 15 MB
const EXTENSOES = { imagem: /\.png$/i, dst: /\.dst$/i };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, ficheiro, cb) => {
    if (EXTENSOES[ficheiro.fieldname]?.test(ficheiro.originalname)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', ficheiro.fieldname));
  }
});
const MAX_FICHEIROS = 6; // por tipo (PNG e DST), por pedido
const camposFicheiros = upload.fields([{ name: 'dst', maxCount: MAX_FICHEIROS }, { name: 'imagem', maxCount: MAX_FICHEIROS }]);

// Envia um ficheiro para o Storage e devolve o link público.
// O nome é limpo porque espaços e acentos fazem o upload falhar.
async function enviarFicheiro(ficheiro, bucket, prefixo, indice = 0) {
  if (!ficheiro) return null;
  const nomeSeguro = ficheiro.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const nomeUnico = `${prefixo}_${Date.now()}_${indice}_${nomeSeguro}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nomeUnico, ficheiro.buffer, { contentType: ficheiro.mimetype, upsert: false });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(nomeUnico).data.publicUrl;
}

function enviarFicheiros(ficheiros = [], bucket, prefixo) {
  return Promise.all(ficheiros.map((f, i) => enviarFicheiro(f, bucket, prefixo, i)));
}

// arquivo_imagem / arquivo_dst guardam uma lista JSON de links;
// pedidos antigos têm um único link em texto simples
function lerUrls(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  if (valor.startsWith('[')) {
    try { return JSON.parse(valor); } catch { return []; }
  }
  return [valor];
}

// Na base de dados fica sempre o link "public" do Storage; a API entrega links assinados
// temporários, para que os buckets possam ser privados
const VALIDADE_LINKS = 12 * 60 * 60; // segundos

function localDoFicheiro(url) {
  const m = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/.exec(url || '');
  return m ? { bucket: m[1], caminho: decodeURIComponent(m[2]) } : null;
}

// Converte um link assinado (vindo do browser na edição) de volta ao link guardado
function paraUrlGuardado(url) {
  const local = localDoFicheiro(url);
  return local ? supabase.storage.from(local.bucket).getPublicUrl(local.caminho).data.publicUrl : url;
}

async function assinarFicheiros(pedidos) {
  const porBucket = {};
  for (const p of pedidos) {
    for (const campo of ['arquivo_imagem', 'arquivo_dst']) {
      for (const url of lerUrls(p[campo])) {
        const local = localDoFicheiro(url);
        if (local) (porBucket[local.bucket] ??= new Set()).add(local.caminho);
      }
    }
  }

  const assinados = {};
  for (const [bucket, caminhos] of Object.entries(porBucket)) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...caminhos], VALIDADE_LINKS);
    if (error) { console.error('Erro ao assinar ficheiros:', error.message); continue; }
    data.forEach(d => { if (d.signedUrl) assinados[`${bucket}/${d.path}`] = d.signedUrl; });
  }

  for (const p of pedidos) {
    for (const campo of ['arquivo_imagem', 'arquivo_dst']) {
      const urls = lerUrls(p[campo]).map(url => {
        const local = localDoFicheiro(url);
        return (local && assinados[`${local.bucket}/${local.caminho}`]) || url;
      });
      p[campo] = urls.length ? JSON.stringify(urls) : null;
    }
  }
  return pedidos;
}

function guardarUrls(urls) {
  const lista = urls.filter(Boolean).slice(0, MAX_FICHEIROS);
  return lista.length ? JSON.stringify(lista) : null;
}

// Linhas de produtos (JSON enviado pelo formulário); undefined mantém o valor atual na edição
function lerItens(texto) {
  if (texto === undefined) return undefined;
  try {
    const itens = JSON.parse(texto);
    return Array.isArray(itens) && itens.length ? itens : null;
  } catch {
    return null;
  }
}

// Campos do pedido partilhados entre criação e edição
function camposPedido(dados) {
  const itens = lerItens(dados.itens);
  return {
    ...(itens !== undefined && { itens }),
    descricao: dados.descricao,
    origem_artigo: dados.origem_artigo,
    codigos_linhas: dados.codigos_linhas,
    valor: dados.valor || 0,
    data_producao: dados.data_producao || null,
    data_entrega: dados.data_entrega || null,
    tipo_pagamento: dados.tipo_pagamento,
    metodo_pagamento: dados.metodo_pagamento,
    valor_pago: dados.valor_pago || null,
    tipo_artigo: dados.tipo_artigo || null,
    quantidade_artigo: dados.quantidade_artigo || null,
    tamanhos_artigo: dados.tamanhos_artigo || null,
    marca_artigo: dados.marca_artigo || null,
    detalhe_bebe: dados.detalhe_bebe || null
  };
}

// ==========================================
// 1. AUTENTICAÇÃO E LOGIN
// ==========================================
// Trava tentativas repetidas de adivinhar palavras-passe
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Demasiadas tentativas. Aguarde 15 minutos e tente novamente.' }
});

const ehHash = senha => /^\$2[aby]\$/.test(senha || '');

app.post('/auth/login', limiteLogin, async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Introduza o email e a palavra-passe.' });

  const { data, error } = await supabase
    .from('utilizadores')
    .select('*')
    .eq('email', String(email).trim())
    .maybeSingle();

  if (error) {
    console.error('Erro Supabase no login:', error.code, error.message);
    return res.status(500).json({ erro: 'Erro ao consultar a base de dados.' });
  }

  // Contas antigas ainda têm a palavra-passe em texto: aceita-a uma vez e converte-a para hash
  const senhaCorreta = data && (ehHash(data.senha)
    ? await bcrypt.compare(String(senha), data.senha)
    : data.senha === senha);

  if (!senhaCorreta) {
    return res.status(401).json({ erro: 'Email ou palavra-passe incorretos.' });
  }

  if (!ehHash(data.senha)) {
    const { error: erroHash } = await supabase
      .from('utilizadores')
      .update({ senha: await bcrypt.hash(String(senha), 10) })
      .eq('id', data.id);
    if (erroHash) console.error('Não foi possível converter a palavra-passe para hash:', erroHash.message);
  }

  res.json({ token: criarToken(data), perfil: data.perfil, nome: data.nome });
});

// Daqui para baixo, todas as rotas exigem sessão iniciada
app.use(autenticar);

// Erros de upload (ficheiro grande demais, tipo errado, ficheiros a mais) devolvem uma mensagem clara
function tratarUpload(req, res, next) {
  camposFicheiros(req, res, erro => {
    if (!erro) return next();
    const mensagem = erro.code === 'LIMIT_FILE_SIZE'
      ? 'Cada ficheiro pode ter no máximo 15 MB.'
      : `Só são aceites ficheiros PNG e DST, até ${MAX_FICHEIROS} de cada.`;
    res.status(400).json({ erro: mensagem });
  });
}

// ==========================================
// 2. GESTÃO DE UTILIZADORES (ADMIN)
// ==========================================
app.get('/utilizadores', apenasAdmin, async (req, res) => {
  const { data } = await supabase.from('utilizadores').select('id, nome, email, perfil');
  res.json(data || []);
});

app.post('/utilizadores', apenasAdmin, async (req, res) => {
  const { nome, email, senha, perfil } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Preencha o email e a palavra-passe.' });

  const { error } = await supabase.from('utilizadores').insert([{
    nome,
    email: String(email).trim(),
    senha: await bcrypt.hash(String(senha), 10),
    perfil: perfil === 'admin' ? 'admin' : 'funcionario'
  }]);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ sucesso: true });
});

app.delete('/utilizadores/:id', apenasAdmin, async (req, res) => {
  await supabase.from('utilizadores').delete().eq('id', req.params.id);
  res.json({ sucesso: true });
});

// ==========================================
// 3. CLIENTES
// ==========================================
app.get('/clientes', async (req, res) => {
  const { data } = await supabase.from('clientes').select('*');
  res.json(data || []);
});

app.post('/clientes', async (req, res) => {
  const { data, error } = await supabase.from('clientes').insert([req.body]).select();
  if (error) return res.status(400).json({ erro: error.message });
  res.json(data);
});

// ==========================================
// 4. PEDIDOS (COM FICHEIROS .DST E IMAGENS PNG)
// ==========================================
app.get('/pedidos', async (req, res) => {
  const { data } = await supabase
    .from('pedidos')
    .select('*, clientes(nome, telefone, nif)')
    .order('id', { ascending: false });
  res.json(await assinarFicheiros(data || []));
});

app.post('/pedidos', tratarUpload, async (req, res) => {
  try {
    const dados = req.body;
    const urlDst = guardarUrls(await enviarFicheiros(req.files?.dst, 'matrizes', 'dst'));
    const urlImagem = guardarUrls(await enviarFicheiros(req.files?.imagem, 'imagens', 'img'));

    const { data, error } = await supabase
      .from('pedidos')
      .insert([{
        cliente_id: dados.cliente_id,
        ...camposPedido(dados),
        status: dados.status || 'Pendente',
        arquivo_dst: urlDst,
        arquivo_imagem: urlImagem
      }])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar pedido.' });
  }
});

app.put('/pedidos/:id', tratarUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const dados = req.body;

    // Mantém os ficheiros que o utilizador não removeu e junta os novos
    const urlDst = guardarUrls([...lerUrls(dados.arquivo_dst).map(paraUrlGuardado), ...(await enviarFicheiros(req.files?.dst, 'matrizes', 'dst'))]);
    const urlImagem = guardarUrls([...lerUrls(dados.arquivo_imagem).map(paraUrlGuardado), ...(await enviarFicheiros(req.files?.imagem, 'imagens', 'img'))]);

    const { data, error } = await supabase
      .from('pedidos')
      .update({
        ...camposPedido(dados),
        arquivo_dst: urlDst,
        arquivo_imagem: urlImagem
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao atualizar pedido.' });
  }
});

app.patch('/pedidos/:id/status', async (req, res) => {
  await supabase.from('pedidos').update({ status: req.body.status }).eq('id', req.params.id);
  res.json({ sucesso: true });
});

app.delete('/pedidos/:id', async (req, res) => {
  await supabase.from('pedidos').delete().eq('id', req.params.id);
  res.json({ sucesso: true });
});

// ==========================================
// 5. ESTOQUE
// ==========================================
app.get('/estoque', async (req, res) => {
  const { data } = await supabase.from('estoque').select('*');
  res.json(data || []);
});

app.post('/estoque', async (req, res) => {
  await supabase.from('estoque').insert([req.body]);
  res.json({ sucesso: true });
});

app.delete('/estoque/:id', async (req, res) => {
  await supabase.from('estoque').delete().eq('id', req.params.id);
  res.json({ sucesso: true });
});

// ==========================================
// 6. RECLAMAÇÕES E SUGESTÕES
// ==========================================
app.get('/feedback', apenasAdmin, async (req, res) => {
  const { data } = await supabase.from('feedback').select('*').order('id', { ascending: false });
  res.json(data || []);
});

app.post('/feedback', async (req, res) => {
  const { tipo, assunto, mensagem } = req.body;
  const autor = req.utilizador.nome || 'Desconhecido';
  if (!['Reclamação', 'Sugestão'].includes(tipo) || !String(mensagem || '').trim()) {
    return res.status(400).json({ erro: 'Dados inválidos.' });
  }

  const { data, error } = await supabase
    .from('feedback')
    .insert([{ tipo, assunto, mensagem: String(mensagem).trim(), autor, estado: 'Novo' }])
    .select();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao guardar a mensagem.' });
  }
  res.json(data[0]);
});

app.patch('/feedback/:id', apenasAdmin, async (req, res) => {
  await supabase.from('feedback').update({ estado: req.body.estado }).eq('id', req.params.id);
  res.json({ sucesso: true });
});

// Ligar o servidor (no fim, para garantir que todas as rotas estão ativas)
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => console.log(`Servidor Bordaveiro a correr na porta ${PORTA}.`));