const picboardDB = require("../db/db")
const jwt = require('jsonwebtoken')
const SECRET_KEY = process.env.JWT_SECRET_KEY

const SQL_USER = `SELECT * FROM users WHERE user_id = $1`

const login = (req, res) => {
    const { userId, password } = req.body

   picboardDB.query(SQL_USER, [userId], (err, result) => {
        if (err) {
            return res.status(500).json({ msg: "Erro no servidor" })
        }
        if(result.rowCount === 0 ){
            return res.status(404).json({msg: "Conta não encontrada"})
        }
        const user = result.rows[0]
        const match = password == user.senha

        if(!match) return res.status(401).json({msg: "Senha incorreta"})
        
        const token = jwt.sign(
            {
                user_id: user.user_id,
                role: user.cargo,

            },
            SECRET_KEY,
            {
                expiresIn: "1h"
            }
        )
        
        return res.json({
            msg: "Usuário logado",
            token,
            user_id: user.user_id,
            role: user.cargo
        })
    }
)}

module.exports = {login}