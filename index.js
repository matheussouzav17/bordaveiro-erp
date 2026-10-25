require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const { criarToken, autenticar, apenasAdmin, apenasEquipa, apenasCliente } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Só os ficheiros do site são públicos (nunca o código do servidor, package.json, node_modules...)
const FICHEIROS_PUBLICOS = new Set([
  '/', '/index.html', '/script.js', '/style.css', '/sw.js', '/manifest.json',
  '/logo.png', '/logo-192.png', '/logo-512.png', '/fundo.jpg',
  '/portal.html', '/portal.js', '/chat.js'
]);
// Endereço curto do portal para os clientes
app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'portal.html')));
app.use((req, res, next) => (FICHEIROS_PUBLICOS.has(req.path) ? express.static(__dirname)(req, res, next) : next()));

// Ligação ao Supabase (credenciais no ficheiro .env)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Multer guarda temporariamente os ficheiros em memória; só aceita PNG e DST até 15 MB
// Equipa: PNG e DST em campos separados. Portal: um único campo com imagens, PDF e matrizes de bordado
const EXTENSOES = { imagem: /\.png$/i, dst: /\.dst$/i, ficheiro: /\.(png|jpe?g|pdf|dst|emb)$/i };
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

// ==========================================
// RECUPERAÇÃO DE PALAVRA-PASSE (PORTAL DO CLIENTE)
// 1. O cliente pede no login e recebe um código que só ele vê (na base de dados fica só o hash).
// 2. O admin autoriza o pedido (não vê o código nem a nova palavra-passe).
// 3. O cliente usa o email + código para definir a nova palavra-passe.
// ==========================================
const VALIDADE_PEDIDO_DIAS = 7;
const VALIDADE_AUTORIZACAO_HORAS = 48;

const limiteRecuperacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Demasiadas tentativas. Aguarde 15 minutos e tente novamente.' }
});

const hashCodigo = codigo => crypto.createHash('sha256').update(String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// Código legível (sem 0/O, 1/I) no formato XXXX-XXXX
function gerarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const c = [...bytes].map(b => letras[b % letras.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

// Devolve o pedido mais recente do cliente se o email e o código baterem certo
async function pedidoRecuperacao(email, codigo) {
  const { data: conta } = await supabase
    .from('utilizadores').select('id').eq('email', String(email || '').trim()).eq('perfil', 'cliente').maybeSingle();
  if (!conta || !codigo) return null;

  const { data: pedido } = await supabase
    .from('recuperacoes_senha').select('*').eq('utilizador_id', conta.id)
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (!pedido) return null;

  const a = Buffer.from(pedido.codigo_hash), b = Buffer.from(hashCodigo(codigo));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const expirado = Date.now() - new Date(pedido.criado_em) > VALIDADE_PEDIDO_DIAS * 864e5 ||
    (pedido.autorizado_em && Date.now() - new Date(pedido.autorizado_em) > VALIDADE_AUTORIZACAO_HORAS * 36e5);
  return { ...pedido, estado: expirado && pedido.estado !== 'Usado' ? 'Expirado' : pedido.estado };
}

app.post('/portal/recuperar', limiteLogin, async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (!email) return res.status(400).json({ erro: 'Indique o seu email.' });

  // A resposta é igual quer a conta exista quer não, para não revelar que emails estão registados
  const codigo = gerarCodigo();
  const { data: conta } = await supabase
    .from('utilizadores').select('id').eq('email', email).eq('perfil', 'cliente').maybeSingle();

  if (conta) {
    // Um pedido novo substitui os anteriores ainda por usar
    await supabase.from('recuperacoes_senha').update({ estado: 'Substituído' })
      .eq('utilizador_id', conta.id).in('estado', ['Pendente', 'Autorizado']);
    const { error } = await supabase.from('recuperacoes_senha')
      .insert([{ utilizador_id: conta.id, codigo_hash: hashCodigo(codigo), estado: 'Pendente' }]);
    if (error) {
      console.error(error);
      return res.status(500).json({ erro: 'Não foi possível registar o pedido.' });
    }
  }
  res.json({ codigo });
});

app.post('/portal/recuperar/estado', limiteRecuperacao, async (req, res) => {
  const pedido = await pedidoRecuperacao(req.body.email, req.body.codigo);
  res.json({ estado: pedido ? pedido.estado : 'Inválido' });
});

app.post('/portal/recuperar/concluir', limiteLogin, async (req, res) => {
  const { email, codigo, nova } = req.body;
  if (!nova || String(nova).length < 8) return res.status(400).json({ erro: 'A nova palavra-passe deve ter pelo menos 8 caracteres.' });

  const pedido = await pedidoRecuperacao(email, codigo);
  if (!pedido) return res.status(400).json({ erro: 'Email ou código incorretos.' });
  if (pedido.estado === 'Pendente') return res.status(403).json({ erro: 'O pedido ainda não foi autorizado pela Bordaveiro.' });
  if (pedido.estado !== 'Autorizado') return res.status(400).json({ erro: 'Este pedido já não é válido. Faça um novo pedido.' });

  // Marca o pedido como usado antes de mudar a palavra-passe (o código só serve uma vez)
  const { data: usado } = await supabase.from('recuperacoes_senha')
    .update({ estado: 'Usado' }).eq('id', pedido.id).eq('estado', 'Autorizado').select('id');
  if (!usado?.length) return res.status(400).json({ erro: 'Este pedido já não é válido. Faça um novo pedido.' });

  const { error } = await supabase.from('utilizadores')
    .update({ senha: await bcrypt.hash(String(nova), 10) }).eq('id', pedido.utilizador_id);
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Não foi possível alterar a palavra-passe.' });
  }
  res.json({ sucesso: true });
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
// PORTAL DO CLIENTE
// Cada conta de cliente só vê e cria pedidos do seu próprio cliente_id (vem do token).
// O cliente não indica nem vê valores.
// ==========================================
const ESTADO_PEDIDO_PORTAL = 'Pedido Cliente';
const uploadPortal = upload.fields([{ name: 'ficheiro', maxCount: MAX_FICHEIROS }]);
// Imagens vão para arquivo_imagem (miniaturas); PDF, DST e EMB para arquivo_dst (botões de download)
const ehImagem = ficheiro => /\.(png|jpe?g)$/i.test(ficheiro.originalname);

const texto = (valor, max) => String(valor ?? '').trim().slice(0, max);
const dataValida = valor => (/^\d{4}-\d{2}-\d{2}$/.test(valor || '') ? valor : null);

// Só guarda nome, descrição, letra, local e quantidade de cada produto
function itensDoCliente(json) {
  let itens;
  try { itens = JSON.parse(json || '[]'); } catch { return []; }
  if (!Array.isArray(itens)) return [];
  return itens
    .map(i => ({
      nome: texto(i?.nome, 150),
      descricao: texto(i?.descricao, 500),
      letra: texto(i?.letra, 100),
      local: texto(i?.local, 150),
      quantidade: Math.min(Math.max(parseInt(i?.quantidade) || 1, 1), 10000)
    }))
    .filter(i => i.nome)
    .slice(0, 30);
}

app.get('/portal/pedidos', apenasCliente, async (req, res) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, data_pedido, descricao, itens, cor_linha, data_pretendida, data_entrega, status, arquivo_imagem, arquivo_dst')
    .eq('cliente_id', req.utilizador.cliente_id)
    .neq('status', 'Orçamento')
    .order('id', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao carregar os pedidos.' });
  }

  // Os preços que a Bordaveiro acrescentar aos produtos não são mostrados ao cliente
  (data || []).forEach(p => {
    if (Array.isArray(p.itens)) p.itens = p.itens.map(({ nome, descricao, letra, local, quantidade }) => ({ nome, descricao, letra, local, quantidade }));
  });
  res.json(await assinarFicheiros(data || []));
});

app.post('/portal/pedidos', apenasCliente, (req, res, next) => {
  uploadPortal(req, res, erro => {
    if (!erro) return next();
    const mensagem = erro.code === 'LIMIT_FILE_SIZE'
      ? 'Cada ficheiro pode ter no máximo 15 MB.'
      : `Só são aceites ficheiros PNG, JPEG, PDF, DST e EMB, até ${MAX_FICHEIROS} no total.`;
    res.status(400).json({ erro: mensagem });
  });
}, async (req, res) => {
  try {
    const itens = itensDoCliente(req.body.itens);
    if (!itens.length) return res.status(400).json({ erro: 'Indique pelo menos um produto.' });

    const ficheiros = req.files?.ficheiro || [];
    const urlImagem = guardarUrls(await enviarFicheiros(ficheiros.filter(ehImagem), 'imagens', 'img'));
    const urlOutros = guardarUrls(await enviarFicheiros(ficheiros.filter(f => !ehImagem(f)), 'matrizes', 'fich'));

    const { data, error } = await supabase
      .from('pedidos')
      .insert([{
        cliente_id: req.utilizador.cliente_id,
        status: ESTADO_PEDIDO_PORTAL,
        descricao: itens.map(i => i.nome).join(', ').slice(0, 300),
        itens,
        cor_linha: texto(req.body.cor_linha, 300) || null,
        data_pretendida: dataValida(req.body.data_pretendida),
        origem_artigo: 'Cliente',
        valor: 0,
        tipo_pagamento: 'Na Entrega',
        arquivo_imagem: urlImagem,
        arquivo_dst: urlOutros
      }])
      .select('id');

    if (error) throw error;
    res.json({ id: data[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar o pedido.' });
  }
});

// O cliente pode cancelar enquanto o pedido aguarda confirmação, ou quando a Bordaveiro
// indicou uma data de entrega diferente da que ele pediu e a nova data não lhe convém
const ESTADO_CANCELADO = 'Cancelado';

function podeCancelar(p) {
  if (p.status === ESTADO_PEDIDO_PORTAL) return true;
  return p.status === 'Pendente' && !!p.data_pretendida && !!p.data_entrega && p.data_entrega !== p.data_pretendida;
}

app.post('/portal/pedidos/:id/cancelar', apenasCliente, async (req, res) => {
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select('id, status, data_pretendida, data_entrega')
    .eq('id', req.params.id)
    .eq('cliente_id', req.utilizador.cliente_id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao cancelar o pedido.' });
  }
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (!podeCancelar(pedido)) return res.status(409).json({ erro: 'Este pedido já não pode ser cancelado. Contacte a Bordaveiro.' });

  // Só altera se o pedido continuar no mesmo estado (evita cancelar algo que a equipa acabou de mudar)
  const { data, error: erroUpdate } = await supabase
    .from('pedidos')
    .update({ status: ESTADO_CANCELADO })
    .eq('id', pedido.id)
    .eq('status', pedido.status)
    .select('id');

  if (erroUpdate) {
    console.error(erroUpdate);
    return res.status(500).json({ erro: 'Erro ao cancelar o pedido.' });
  }
  if (!data.length) return res.status(409).json({ erro: 'O pedido foi atualizado entretanto. Recarregue a página.' });
  res.json({ sucesso: true });
});

// Opções da conta que o portal precisa de saber (lidas da base de dados, não do token,
// para que uma alteração do admin tenha efeito logo)
async function contaCliente(id) {
  const { data } = await supabase.from('utilizadores').select('feedback_ativo').eq('id', id).maybeSingle();
  return { feedback_ativo: data?.feedback_ativo !== false };
}

app.get('/portal/conta', apenasCliente, async (req, res) => {
  res.json(await contaCliente(req.utilizador.id));
});

// Reclamações e sugestões dos clientes: só sobre o portal / sistema.
// O admin pode desligar esta opção para um cliente que a use para outros assuntos.
const ASSUNTOS_FEEDBACK_PORTAL = ['Erro no portal', 'Fazer ou acompanhar pedidos', 'Palavra-passe / acesso', 'Outro (sobre o portal)'];

app.post('/portal/feedback', apenasCliente, async (req, res) => {
  if (!(await contaCliente(req.utilizador.id)).feedback_ativo) {
    return res.status(403).json({ erro: 'As sugestões e reclamações estão desativadas para a sua conta. Contacte a Bordaveiro diretamente.' });
  }
  const { tipo, assunto, mensagem } = req.body;
  if (!['Reclamação', 'Sugestão'].includes(tipo) || !ASSUNTOS_FEEDBACK_PORTAL.includes(assunto) || !String(mensagem || '').trim()) {
    return res.status(400).json({ erro: 'Dados inválidos.' });
  }

  const { data: cliente } = await supabase.from('clientes').select('nome').eq('id', req.utilizador.cliente_id).maybeSingle();
  const { data, error } = await supabase
    .from('feedback')
    .insert([{
      tipo,
      assunto,
      mensagem: texto(mensagem, 3000),
      autor: `${req.utilizador.nome || 'Cliente'}${cliente ? ` (cliente ${cliente.nome})` : ''}`,
      estado: 'Novo',
      origem: 'Portal',
      utilizador_id: req.utilizador.id
    }])
    .select('id');

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Não foi possível enviar a mensagem. Tente novamente.' });
  }
  res.json(data[0]);
});

// O cliente troca a palavra-passe definida pelo admin. Fica guardada só como hash,
// por isso ninguém (nem o admin) a consegue ver
app.post('/portal/senha', apenasCliente, limiteLogin, async (req, res) => {
  const { atual, nova } = req.body;
  if (!atual || !nova) return res.status(400).json({ erro: 'Preencha a palavra-passe atual e a nova.' });
  if (String(nova).length < 8) return res.status(400).json({ erro: 'A nova palavra-passe deve ter pelo menos 8 caracteres.' });
  if (nova === atual) return res.status(400).json({ erro: 'A nova palavra-passe tem de ser diferente da atual.' });

  const { data: conta, error } = await supabase
    .from('utilizadores')
    .select('id, senha')
    .eq('id', req.utilizador.id)
    .maybeSingle();
  if (error || !conta) return res.status(500).json({ erro: 'Erro ao alterar a palavra-passe.' });

  const atualCorreta = ehHash(conta.senha)
    ? await bcrypt.compare(String(atual), conta.senha)
    : conta.senha === atual;
  if (!atualCorreta) return res.status(400).json({ erro: 'A palavra-passe atual está incorreta.' });

  const { error: erroUpdate } = await supabase
    .from('utilizadores')
    .update({ senha: await bcrypt.hash(String(nova), 10) })
    .eq('id', conta.id);
  if (erroUpdate) return res.status(500).json({ erro: 'Erro ao alterar a palavra-passe.' });
  res.json({ sucesso: true });
});

// Daqui para baixo, só a equipa Bordaveiro (admin e funcionários)
app.use(apenasEquipa);

// ==========================================
// 2. GESTÃO DE UTILIZADORES (ADMIN)
// ==========================================
app.get('/utilizadores', apenasAdmin, async (req, res) => {
  const { data } = await supabase.from('utilizadores').select('id, nome, email, perfil, cliente_id, feedback_ativo, clientes(nome)');
  res.json(data || []);
});

app.post('/utilizadores', apenasAdmin, async (req, res) => {
  const { nome, email, senha, perfil, cliente_id } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Preencha o email e a palavra-passe.' });
  if (perfil === 'cliente' && !cliente_id) return res.status(400).json({ erro: 'Escolha o cliente desta conta.' });

  const { error } = await supabase.from('utilizadores').insert([{
    nome,
    email: String(email).trim(),
    senha: await bcrypt.hash(String(senha), 10),
    perfil: ['admin', 'cliente'].includes(perfil) ? perfil : 'funcionario',
    cliente_id: perfil === 'cliente' ? cliente_id : null
  }]);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ sucesso: true });
});

// Liga/desliga as reclamações e sugestões de uma conta de cliente no portal
app.patch('/utilizadores/:id/feedback', apenasAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('utilizadores')
    .update({ feedback_ativo: req.body.ativo === true })
    .eq('id', req.params.id)
    .eq('perfil', 'cliente')
    .select('id');
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao atualizar a conta.' });
  }
  if (!data.length) return res.status(404).json({ erro: 'Conta de cliente não encontrada.' });
  res.json({ sucesso: true });
});

// Pedidos de nova palavra-passe dos clientes à espera de autorização
app.get('/recuperacoes', apenasAdmin, async (req, res) => {
  const desde = new Date(Date.now() - VALIDADE_PEDIDO_DIAS * 864e5).toISOString();
  const { data, error } = await supabase
    .from('recuperacoes_senha')
    .select('id, criado_em, utilizadores(nome, email, clientes(nome))')
    .eq('estado', 'Pendente')
    .gte('criado_em', desde)
    .order('id', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao carregar os pedidos.' });
  }
  res.json(data || []);
});

app.post('/recuperacoes/:id/:decisao', apenasAdmin, async (req, res) => {
  const { decisao } = req.params;
  if (!['autorizar', 'recusar'].includes(decisao)) return res.status(404).json({ erro: 'Ação desconhecida.' });

  const alteracao = decisao === 'autorizar'
    ? { estado: 'Autorizado', autorizado_em: new Date().toISOString() }
    : { estado: 'Recusado' };
  const { data, error } = await supabase
    .from('recuperacoes_senha').update(alteracao)
    .eq('id', req.params.id).eq('estado', 'Pendente').select('id');
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao atualizar o pedido.' });
  }
  if (!data.length) return res.status(409).json({ erro: 'Este pedido já foi tratado.' });
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

// Confirmação de um pedido feito no portal: passa a pedido oficial com a data de entrega
// (a data pedida pelo cliente, ou a previsão da Bordaveiro) e o valor total com IVA (obrigatório)
app.patch('/pedidos/:id/confirmar', async (req, res) => {
  const dataEntrega = dataValida(req.body.data_entrega);
  const valor = parseFloat(req.body.valor);
  if (!(valor > 0)) return res.status(400).json({ erro: 'Indique o valor do pedido.' });
  if (!dataEntrega) return res.status(400).json({ erro: 'Indique a data de entrega.' });

  const { data, error } = await supabase
    .from('pedidos')
    .update({ status: 'Pendente', data_entrega: dataEntrega, valor })
    .eq('id', req.params.id)
    .eq('status', ESTADO_PEDIDO_PORTAL)
    .select('id');

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao confirmar o pedido.' });
  }
  if (!data.length) return res.status(409).json({ erro: 'Este pedido já foi confirmado.' });
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
  const { data } = await supabase.from('feedback').select('*, utilizadores(feedback_ativo)').order('id', { ascending: false });
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