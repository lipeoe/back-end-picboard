const express = require('express')
const router = express.Router()
const picboardDB = require("../db/db")

const SQL_TICKET_MEDIO = `
    SELECT COALESCE(AVG(valor_cupom), 0)::numeric AS ticket_medio
    FROM picmoney_transacoes;
`

const SQL_PERFORMANCE_POR_TIPO_CUPOM = `
    WITH agg AS (
      SELECT
        COALESCE(NULLIF(TRIM(tipo_cupom), ''), '(Sem tipo)') AS tipo_cupom,
        COUNT(*)                               AS quantidade,
        SUM(valor_cupom)::numeric              AS total_valor_cupom,
        AVG(valor_cupom)::numeric              AS ticket_medio,
        SUM(repasse_picmoney)::numeric         AS total_repasse,
        (SUM(valor_cupom) - SUM(repasse_picmoney))::numeric AS receita_liquida
      FROM picmoney_transacoes
      GROUP BY 1
    )
    SELECT
      tipo_cupom,
      quantidade,
      total_valor_cupom,
      ticket_medio,
      total_repasse,
      receita_liquida,
      ROUND(
        (total_valor_cupom / NULLIF(SUM(total_valor_cupom) OVER (), 0)) * 100
      , 2) AS participacao_percentual
    FROM agg
    ORDER BY total_valor_cupom DESC, tipo_cupom;

`

const SQL_PERFORMANCE_POR_PERIODO_DIA = `
    WITH base AS (
      SELECT
        CASE
          WHEN hora >= TIME '06:00' AND hora < TIME '12:00' THEN 'Manhã'
          WHEN hora >= TIME '12:00' AND hora < TIME '18:00' THEN 'Tarde'
          WHEN hora >= TIME '18:00' AND hora < TIME '23:00' THEN 'Noite'
        END AS periodo,
        valor_cupom
      FROM picmoney_transacoes
      WHERE hora >= TIME '06:00' AND hora < TIME '23:00'  -- sem madrugada
    ),
    agg AS (
      SELECT
        periodo,
        COUNT(*)                  AS quantidade,
        SUM(valor_cupom)::numeric AS total_valor_cupom,
        AVG(valor_cupom)::numeric AS ticket_medio
      FROM base
      GROUP BY periodo
    )
    SELECT
      periodo,
      quantidade,
      total_valor_cupom,
      ticket_medio,
      ROUND(
        (total_valor_cupom / NULLIF(SUM(total_valor_cupom) OVER (), 0)) * 100
      , 2) AS participacao_percentual
    FROM agg
    ORDER BY CASE periodo
      WHEN 'Manhã' THEN 1
      WHEN 'Tarde' THEN 2
      WHEN 'Noite' THEN 3
    END;
`

const SQL_PARTICIPACAO_DIARIA = `
  WITH agg AS (
    SELECT
      EXTRACT(ISODOW FROM data_captura) AS dow,
      CASE EXTRACT(ISODOW FROM data_captura)
        WHEN 1 THEN 'Segunda'
        WHEN 2 THEN 'Terça'
        WHEN 3 THEN 'Quarta'
        WHEN 4 THEN 'Quinta'
        WHEN 5 THEN 'Sexta'
        WHEN 6 THEN 'Sábado'
        WHEN 7 THEN 'Domingo'
      END AS dia_semana,
      AVG(valor_cupom)::numeric AS ticket_medio,
      SUM(valor_cupom)::numeric AS total_por_dia
    FROM picmoney_transacoes
    GROUP BY dow, dia_semana
  )
  SELECT
    dow,
    dia_semana,
    ticket_medio,
    total_por_dia,
    ROUND((total_por_dia / NULLIF(SUM(total_por_dia) OVER (), 0)) * 100, 2) AS participacao_percentual
  FROM agg
  ORDER BY total_por_dia DESC;

`

router.get("/kpis/ticket-medio", async (req, res) =>{
    try{
        const {rows} = await picboardDB.query(SQL_TICKET_MEDIO)
        res.json({ticket_medio: Number(rows[0].ticket_medio ?? 0)})
    }catch(err){
        console.error("Erro /kpis/ticket-medio", err)
        res.status(500).json({error: "Erro ao calcular ticket médio"})
    }
})

router.get("/kpis/receita-por-cupom", async (req, res) => {
    try{
        const {rows} = await picboardDB.query(SQL_PERFORMANCE_POR_TIPO_CUPOM)
        const data = rows.map(r => ({
            tipo_cupom: r.tipo_cupom,
            quantidade: Number(r.quantidade),
            total_valor_cupom: Number(r.total_valor_cupom),
            ticket_medio: Number(r.ticket_medio),
            total_repasse: Number(r.total_repasse),
            receita_liquida: Number(r.receita_liquida),
            participacao_percentual: Number(r.participacao_percentual)
        }))
        res.json({dados_cupons: data})
    }catch(err){
        console.error("Erro /kpis/receita-por-cupom", err)
        res.status(500).json({error: "Erro ao calcular valores por cupom."})
    }
})

router.get("/kpis/participacao-por-periodo", async (req, res) => {
    try{
        const {rows} = await picboardDB.query(SQL_PERFORMANCE_POR_PERIODO_DIA)
        const data = rows.map(r => ({
            periodo: r.periodo,
            quantidade: Number(r.quantidade),
            total_valor_cupom: Number(r.total_valor_cupom),
            ticket_medio: Number(r.ticket_medio),
            participacao_percentual: Number(r.participacao_percentual)
        }))
        res.json(data)
    }catch(err){
        console.error("Erro /kpis/participacao-por-periodo", err)
        res.status(500).json({error: "Erro ao receber dados dos cupons"})
    }
})

router.get("/kpis/participacao-diaria", async (req, res) => {
  try{
    const {rows} = await picboardDB.query(SQL_PARTICIPACAO_DIARIA)
    const data = rows.map(r => ({
      dow: Number(r.dow),
      dia_semana: r.dia_semana,
      ticket_medio: Number(r.ticket_medio),
      total_por_dia: Number(r.total_por_dia),
      participacao_percentual: Number(r.participacao_percentual)
    }))
    res.json(data)
  }catch(err){
    console.error("Erro /kpis/participacao-diaria", err)
    res.status(500).json({error: "Erro ao acessar dados diários"})
  }
})

module.exports = router