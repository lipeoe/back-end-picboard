const express = require("express")
const cors = require("cors")
const kpisCEO = require("./routes/ceoRoutes")
const kpisCFO = require("./routes/cfoRoutes")


const app = express()

const PORT = process.env.PORT || 3001

app.use(express.json())
app.use(cors())

app.use("/api", kpisCEO, kpisCFO)

app.listen(PORT, () =>{
    console.log(`Servidor rodando em: ${PORT}`)
})
