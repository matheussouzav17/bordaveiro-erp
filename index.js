require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ligação ao Supabase (credenciais no ficheiro .env)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Multer guarda temporariamente os ficheiros em memória
const upload = multer({ storage: multer.memoryStorage() });
const camposFicheiros = upload.fields([{ name: 'dst' }, { name: 'imagem' }]);

// Envia um ficheiro para o Storage e devolve o link público.
// O nome é limpo porque espaços e acentos fazem o upload falhar.
async function enviarFicheiro(ficheiro, bucket, prefixo) {
  if (!ficheiro) return null;
  const nomeSeguro = ficheiro.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const nomeUnico = `${prefixo}_${Date.now()}_${nomeSeguro}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nomeUnico, ficheiro.buffer, { contentType: ficheiro.mimetype, upsert: false });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(nomeUnico).data.publicUrl;
}

// Campos do pedido partilhados entre criação e edição
function camposPedido(dados) {
  return {
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
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const { data } = await supabase
    .from('utilizadores')
    .select('*')
    .eq('email', email)
    .eq('senha', password)
    .single();

  if (data) {
    res.json({ token: 'sessao_' + data.id, perfil: data.perfil, nome: data.nome });
  } else {
    res.status(401).json({ erro: 'Email ou palavra-passe incorretos.' });
  }
});

// ==========================================
// 2. GESTÃO DE UTILIZADORES (ADMIN)
// ==========================================
app.get('/utilizadores', async (req, res) => {
  const { data } = await supabase.from('utilizadores').select('id, nome, email, perfil');
  res.json(data || []);
});

app.post('/utilizadores', async (req, res) => {
  const { error } = await supabase.from('utilizadores').insert([req.body]);
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ sucesso: true });
});

app.delete('/utilizadores/:id', async (req, res) => {
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
  res.json(data || []);
});

app.post('/pedidos', camposFicheiros, async (req, res) => {
  try {
    const dados = req.body;
    const urlDst = await enviarFicheiro(req.files?.dst?.[0], 'matrizes', 'dst');
    const urlImagem = await enviarFicheiro(req.files?.imagem?.[0], 'imagens', 'img');

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

app.put('/pedidos/:id', camposFicheiros, async (req, res) => {
  try {
    const { id } = req.params;
    const dados = req.body;

    // Mantém o ficheiro antigo se não vier um novo
    const urlDst = (await enviarFicheiro(req.files?.dst?.[0], 'matrizes', 'dst')) || dados.arquivo_dst || null;
    const urlImagem = (await enviarFicheiro(req.files?.imagem?.[0], 'imagens', 'img')) || dados.arquivo_imagem || null;

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

// Ligar o servidor (no fim, para garantir que todas as rotas estão ativas)
app.listen(3000, () => console.log('Servidor Bordaveiro a correr na porta 3000.'));