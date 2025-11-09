const express = require('express')
const router = express.Router()

const picboardDB = require("../db/db")

const SQL_TICKET_MEDIO = `
  SELECT COALESCE(AVG(valor_cupom), 0)::numeric AS ticket_medio
  FROM picmoney_unificada;
`

const SQL_PERFORMANCE_POR_TIPO_CUPOM = `
  WITH agg AS (
    SELECT
      COALESCE(NULLIF(TRIM(tipo_cupom), ''), '(Sem tipo)') AS tipo_cupom,
      COUNT(*)::bigint                         AS quantidade,
      COALESCE(SUM(valor_cupom), 0)::numeric  AS total_valor_cupom,
      COALESCE(AVG(valor_cupom), 0)::numeric  AS ticket_medio,
      COALESCE(SUM(repasse_picmoney), 0)::numeric AS total_repasse,
      (COALESCE(SUM(valor_cupom), 0) - COALESCE(SUM(repasse_picmoney), 0))::numeric AS receita_liquida
    FROM picmoney_unificada
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
        WHEN EXTRACT(HOUR FROM hora) >= 6 AND EXTRACT(HOUR FROM hora) < 12 THEN 'Manhã'
        WHEN EXTRACT(HOUR FROM hora) >= 12 AND EXTRACT(HOUR FROM hora) < 18 THEN 'Tarde'
        WHEN EXTRACT(HOUR FROM hora) >= 18 AND EXTRACT(HOUR FROM hora) < 23 THEN 'Noite'
      END AS periodo,
      valor_cupom
    FROM picmoney_unificada
    WHERE EXTRACT(HOUR FROM hora) >= 6 AND EXTRACT(HOUR FROM hora) < 23 -- sem madrugada
  ),
  agg AS (
    SELECT
      periodo,
      COUNT(*)::bigint                       AS quantidade,
      COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom,
      COALESCE(AVG(valor_cupom), 0)::numeric AS ticket_medio
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
      COALESCE(AVG(valor_cupom), 0)::numeric AS ticket_medio,
      COALESCE(SUM(valor_cupom), 0)::numeric AS total_por_dia
    FROM picmoney_unificada
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

const SQL_DADOS_30DIAS = `
  WITH params AS (
    -- $1 deve ser algo como '2025-11-01' (ou NULL para mês atual)
    SELECT COALESCE($1::date, (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date) AS   base_date
  ),
  bounds AS (
    SELECT
      date_trunc('month', base_date)::date                              AS month_start,
      (date_trunc('month', base_date) + INTERVAL '1 month - 1 day')::date AS month_end
    FROM params
  ),
  calendar AS (
    SELECT gs::date AS dia
    FROM bounds b,
         LATERAL generate_series(b.month_start, b.month_end, '1 day') gs
  ),
  dados AS (
    SELECT
      -- Força tratar como texto e converter: funciona para colunas text ou date
      to_date(data_captura::text, 'YYYY-MM-DD')                  AS data_sp,
      (valor_cupom)::numeric                                     AS valor_cupom,
      (valor_compra)::numeric                                    AS valor_compra,
      (repasse_picmoney)::numeric                                AS repasse_picmoney,
      id_cupom,
      id_campanha
    FROM picmoney_unificada
  ),
  agg AS (
    SELECT
      d.data_sp                                                  AS dia,
      COALESCE(SUM(d.valor_cupom), 0)                            AS total_valor_cupom,
      COALESCE(SUM(d.valor_compra), 0)                           AS total_valor_compra,
      COALESCE(SUM(d.repasse_picmoney), 0)                       AS total_repasse_picmoney,
      COUNT(DISTINCT d.id_cupom)                                 AS total_cupons,
      COUNT(DISTINCT d.id_campanha)                              AS total_campanhas
    FROM dados d
    JOIN bounds b ON d.data_sp BETWEEN b.month_start AND b.month_end
    GROUP BY d.data_sp
  )
  SELECT
    c.dia,
    COALESCE(a.total_valor_cupom, 0)        AS total_valor_cupom,
    COALESCE(a.total_valor_compra, 0)       AS total_valor_compra,
    COALESCE(a.total_repasse_picmoney, 0)   AS total_repasse_picmoney,
    COALESCE(a.total_cupons, 0)             AS total_cupons,
    COALESCE(a.total_campanhas, 0)          AS total_campanhas
  FROM calendar c
  LEFT JOIN agg a USING (dia)
  ORDER BY c.dia;
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

router.get('/kpis/diario-mensal', async (req, res) => {
  try {
    const { month } = req.query
    
    const baseDate =
      typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
        ? `${month}-01`
        : null

    const { rows } = await picboardDB.query(SQL_DADOS_30DIAS, [baseDate])

    
    const resolvedMonth =
      rows.length > 0 ? rows[0].dia.toISOString().slice(0, 7) : (month || null)

    return res.status(200).json({
      month: resolvedMonth, 
      days: rows,           
    });
  } catch (err) {
    console.error('Erro /kpis/diario-mensal:', err)
    return res.status(500).json({ error: 'Erro ao consultar dados diários do mês.' })
  }
})

module.exports = router