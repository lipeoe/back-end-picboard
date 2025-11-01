const express = require('express')
const router = express.Router()
const picboardDB = require("../db/db")


const SQL_TOTAL_GERAL = `
  SELECT COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom
  FROM picmoney_unificada;
`

const SQL_RECEITA_LIQUIDA = `
  SELECT 
    COALESCE(SUM(valor_cupom), 0)::numeric        AS total_valor_cupom,
    COALESCE(SUM(repasse_picmoney), 0)::numeric   AS total_repasse_picmoney,
    COALESCE(SUM(valor_cupom), 0) - COALESCE(SUM(repasse_picmoney), 0) AS receita_liquida
  FROM picmoney_unificada;
`

const SQL_TOTAL_SEGUIMENTOS = `
  SELECT
    COALESCE(NULLIF(TRIM(categoria_estabelecimento), ''), '(Sem categoria)') AS categoria_estabelecimento,
    COUNT(*)::bigint                                AS total_ocorrencias,
    COALESCE(SUM(valor_cupom), 0)::numeric         AS total_valor_cupom
  FROM picmoney_unificada
  GROUP BY 1
  ORDER BY total_valor_cupom DESC, categoria_estabelecimento;
`

const SQL_TOTAL_PARCEIROS = `
  SELECT
    COALESCE(NULLIF(TRIM(nome_estabelecimento), ''), '(Sem nome)') AS nome_estabelecimento,
    COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom
  FROM picmoney_unificada
  GROUP BY 1
  ORDER BY total_valor_cupom DESC, nome_estabelecimento;
`


router.get("/kpis/receita-total", async (req, res) => {
    try {
      const { rows } = await picboardDB.query(SQL_TOTAL_GERAL)
      res.json({ total_valor_cupom: Number(rows[0].total_valor_cupom ?? 0) })
    } catch (err) {
      console.error("Erro /kpis/receita-total:", err)
      res.status(500).json({ error: "Erro ao calcular total_geral" })
    }
})



router.get("/kpis/receita-liquida", async(req, res) => {
    try{
        const { rows } = await picboardDB.query(SQL_RECEITA_LIQUIDA)
        res.json({receita_liquida: Number(rows[0].receita_liquida ?? 0)})
    }catch(err){
        console.error("Erro /kpis/receita-liquida: ", err)
        res.status(500).json({error: "Erro ao calcular."})
    }
})


router.get("/kpis/total-seguimentos", async (req, res) => {
    try{
        const {rows} = await picboardDB.query(SQL_TOTAL_SEGUIMENTOS)

        const data = rows.map(r => ({
          categoria_estabelecimento: r.categoria_estabelecimento,
          total_ocorrencias: Number(r.total_ocorrencias),
          total_valor_cupom: Number(r.total_valor_cupom),
    }))

        res.json({seguimentos: data})
    } catch (err) {
        console.error("Erro /kpis/total-segmentos:", err)
        res.status(500).json({ error: "Erro ao calcular total por segmentos" })
    }
})


router.get("/kpis/total-parceiros", async (req, res) => {
    try{
        const { rows } = await picboardDB.query(SQL_TOTAL_PARCEIROS)
        const data = rows.map(r => ({
            nome_estabelecimento: r.nome_estabelecimento,
            total_valor_cupom: Number(r.total_valor_cupom)
        }))
        res.json({parceiros: data})
    } catch (err){
        console.error("Erro /kpis/total-parceiros:", err)
        res.status(500).json({error: "Erro ao calcular total por parceiros"})
    }
})


module.exports = router