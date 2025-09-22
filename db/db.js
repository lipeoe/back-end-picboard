require("dotenv").config()
const { error } = require("console")
const { Pool } = require ("pg")

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,

    ssl: {rejectUnauthorized: false}
}

const picboardDB = new Pool(poolConfig)

picboardDB.connect()
    .then(() => console.log("Conectado ao banco de dados."))
    .catch(error => console.error("Erro ao conectar", error))

module.exports = picboardDB