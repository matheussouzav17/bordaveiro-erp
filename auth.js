const jwt = require('jsonwebtoken');

const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) throw new Error('Falta definir JWT_SECRET no ficheiro .env');

const DURACAO_SESSAO = '12h';

function criarToken(utilizador) {
  return jwt.sign(
    { id: utilizador.id, perfil: utilizador.perfil, nome: utilizador.nome },
    SEGREDO,
    { expiresIn: DURACAO_SESSAO }
  );
}

// Exige um token válido no cabeçalho "Authorization: Bearer <token>"
function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Sessão em falta. Inicie sessão novamente.' });

  try {
    req.utilizador = jwt.verify(token, SEGREDO);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Inicie sessão novamente.' });
  }
}

// O perfil vem do token assinado, por isso não pode ser alterado no browser
function apenasAdmin(req, res, next) {
  if (req.utilizador?.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Acesso reservado a administradores.' });
  }
  next();
}

module.exports = { criarToken, autenticar, apenasAdmin };
