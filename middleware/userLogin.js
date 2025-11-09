const picboardDB = require("../db/db")
const jwt = require('jsonwebtoken')
const SECRET_KEY = process.env.JWT_SECRET_KEY
const bcrypt = require('bcrypt')

const SQL_USER = `
  SELECT user_id, cargo, senha
  FROM users
  WHERE user_id = $1
  LIMIT 1;
`

async function login(req, res) {
  try {
    if (!SECRET_KEY) {
      return res.status(500).json({ msg: "Configuração ausente: JWT_SECRET_KEY" })
    }

    const { userId, password } = req.body || {}

    if (typeof userId !== "string" || !userId.trim() || typeof password !== "string" || !password) {
      return res.status(400).json({ msg: "Informe userId e password." })
    }

    const { rows } = await picboardDB.query(SQL_USER, [userId.trim()])
    if (rows.length === 0) {
      return res.status(404).json({ msg: "Conta não encontrada" })
    }

    const user = rows[0]


    let match = false;
    if (user.senha) {
      match = await bcrypt.compare(password, user.senha)
    } else if (user.senha) {

      match = password === user.senha
    }

    if (!match) {
      return res.status(401).json({ msg: "Credenciais inválidas" })
    }

    const token = jwt.sign(
      {
        sub: user.user_id,       
        user_id: user.user_id,   
        role: user.cargo || "user",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    )

    return res.status(200).json({
      msg: "Usuário logado",
      token,
      user_id: user.user_id,
      role: user.cargo || "user",
      expires_in: 3600, 
    })
  } catch (err) {
    console.error("Erro no login:", err)
    return res.status(500).json({ msg: "Erro no servidor" })
  }
}
module.exports = {login}