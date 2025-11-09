const bcrypt = require('bcrypt');
const picboardDB = require('../db/db');

const SQL_INSERT_USUARIO = `
  INSERT INTO users (user_id, nome, email, senha, cargo)
  VALUES ($1, $2, $3, $4, COALESCE($5, 'USER'))
  RETURNING id, user_id, nome, email, cargo
`

const SALT_ROUNDS = 10

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

async function signup(req, res) {
  try {
    const { user_id, nome, email, senha, cargo } = req.body || {};


    if (!user_id || !nome || !isEmail(email) || !senha) {
      return res.status(400).json({ msg: 'Envie user_id, nome, email válido e senha.' })
    }
    if (String(senha).length < 8) {
      return res.status(400).json({ msg: 'A senha deve ter pelo menos 8 caracteres.' })
    }


    const cargoParam =
      typeof cargo === 'string' && cargo.trim() ? cargo.trim().toUpperCase() : null

    const senhaHash = await bcrypt.hash(String(senha), SALT_ROUNDS)

    const { rows } = await picboardDB.query(SQL_INSERT_USUARIO, [
      String(user_id).trim(),
      String(nome).trim(),
      String(email).trim(),
      senhaHash,     
      cargoParam     
    ])

    return res.status(201).json({
      msg: 'Usuário cadastrado com sucesso.',
      usuario: rows[0],
    })
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ msg: 'E-mail ou user_id já cadastrado.' })
    }
    console.error('Erro ao cadastrar usuário:', err)
    return res.status(500).json({ msg: 'Erro interno ao cadastrar usuário.' })
  }
}

module.exports = { signup }
