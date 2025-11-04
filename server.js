require('dotenv').config()
const express = require("express")
const cors = require("cors")
const kpisCEO = require("./routes/ceoRoutes")
const kpisCFO = require("./routes/cfoRoutes")
const userLogin = require("./routes/loginRoutes")
const { startScheduler } = require("./jobs/jobScheduler")
const PORT = process.env.PORT || 3001

const app = express()

app.use(express.json())
app.use(cors())

const { runOnce } = require('./dataGenerator/dataRunner')

app.use("/auth", userLogin)
app.use("/api", kpisCEO, kpisCFO)

app.listen(PORT, async () =>{
    console.log(`Servidor rodando em: ${PORT}`)

    if (process.env.SEED_ON_BOOT === 'true') {
        try {
            await runOnce()
        } catch (e) {
            console.error('Seed on boot failed:', e.message)
        }
    }
    startScheduler()
})
