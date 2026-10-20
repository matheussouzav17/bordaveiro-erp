const { createClient } = require('@supabase/supabase-js');

// Configurar o cliente Supabase (usa as tuas variáveis de ambiente)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const autenticar = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Espera o token no formato "Bearer <token>"

  if (!token) return res.status(401).json({ erro: "Acesso negado: Token não fornecido" });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ erro: "Acesso negado: Token inválido" });
  }

  req.user = data.user; // Guarda o utilizador no objeto request
  next(); // Passa para a próxima função da rota
};

module.exports = autenticar;