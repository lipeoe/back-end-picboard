const express = require('express')
const router = express.Router()
const picboardDB = require("../db/db")

function parseDate(s) {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? s : null
}
function toInt(v, def) {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : def
}
function pickOne(v, allowed, def) {
  const low = String(v || '').toLowerCase()
  return allowed.includes(low) ? low : def
}



const SQL_TOTAL_GERAL = `
  WITH params AS (
  SELECT 
    date_trunc('month', now())::date AS this_month_start,
    (date_trunc('month', now()) - interval '1 month')::date AS prev_month_start
  ),
  last2 AS (
    SELECT
      CASE
        WHEN t.data_captura >= p.this_month_start
         AND t.data_captura <  (p.this_month_start + interval '1 month') THEN 'this'
        WHEN t.data_captura >= p.prev_month_start
         AND t.data_captura <  p.this_month_start THEN 'prev'
      END AS bucket,
      SUM(t.valor_cupom)::numeric AS total_valor_cupom
    FROM picmoney_unificada t
    CROSS JOIN params p
    WHERE t.data_captura >= p.prev_month_start
      AND t.data_captura <  (p.this_month_start + interval '1 month')
    GROUP BY 1
  ),
  alltime AS (
    SELECT COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom_all
    FROM picmoney_unificada
  )
  SELECT
    a.total_valor_cupom_all AS total_geral,
    COALESCE(l_this.total_valor_cupom, 0) AS mes_atual,
    COALESCE(l_prev.total_valor_cupom, 0) AS mes_anterior,
    CASE
      WHEN COALESCE(l_prev.total_valor_cupom, 0) = 0 THEN NULL
      ELSE ROUND(
        (COALESCE(l_this.total_valor_cupom, 0) - COALESCE(l_prev.total_valor_cupom, 0))
        / NULLIF(COALESCE(l_prev.total_valor_cupom, 0), 0) * 100,
        2
      )
    END AS variacao_percent,
    CASE
      WHEN COALESCE(l_this.total_valor_cupom, 0) > COALESCE(l_prev.total_valor_cupom, 0) THEN   'up'
      WHEN COALESCE(l_this.total_valor_cupom, 0) < COALESCE(l_prev.total_valor_cupom, 0) THEN   'down'
      ELSE 'flat'
    END AS trend
  FROM alltime a
  LEFT JOIN last2 l_this ON l_this.bucket = 'this'
  LEFT JOIN last2 l_prev ON l_prev.bucket = 'prev';

`

const SQL_RECEITA_LIQUIDA = `
  WITH params AS (
  SELECT 
    date_trunc('month', now())::date AS this_month_start,
    (date_trunc('month', now()) - interval '1 month')::date AS prev_month_start
  ),
  last2 AS (
    SELECT
      CASE
        WHEN t.data_captura >= p.this_month_start
         AND t.data_captura <  (p.this_month_start + interval '1 month') THEN 'this'
        WHEN t.data_captura >= p.prev_month_start
         AND t.data_captura <  p.this_month_start THEN 'prev'
      END AS bucket,
      SUM(t.valor_cupom)::numeric AS total_valor_cupom,
      SUM(t.repasse_picmoney)::numeric AS total_repasse_picmoney,
      SUM(t.valor_cupom - t.repasse_picmoney)::numeric AS receita_liquida
    FROM picmoney_unificada t
    CROSS JOIN params p
    WHERE t.data_captura >= p.prev_month_start
      AND t.data_captura <  (p.this_month_start + interval '1 month')
    GROUP BY 1
  ),
  alltime AS (
    SELECT 
      COALESCE(SUM(valor_cupom - repasse_picmoney), 0)::numeric AS total_receita_liquida_all
    FROM picmoney_unificada
  )
  SELECT
    a.total_receita_liquida_all AS receita_liquida_total,
    COALESCE(l_this.receita_liquida, 0) AS mes_atual,
    COALESCE(l_prev.receita_liquida, 0) AS mes_anterior,
    CASE
      WHEN COALESCE(l_prev.receita_liquida, 0) = 0 THEN 0
      ELSE ROUND(
        (COALESCE(l_this.receita_liquida, 0) - COALESCE(l_prev.receita_liquida, 0))
        / NULLIF(COALESCE(l_prev.receita_liquida, 0), 0) * 100,
        2
      )
    END AS variacao_percent,
    CASE
      WHEN COALESCE(l_this.receita_liquida, 0) > COALESCE(l_prev.receita_liquida, 0) THEN 'up'
      WHEN COALESCE(l_this.receita_liquida, 0) < COALESCE(l_prev.receita_liquida, 0) THEN 'down'
      ELSE 'flat'
    END AS trend
  FROM alltime a
  LEFT JOIN last2 l_this ON l_this.bucket = 'this'
  LEFT JOIN last2 l_prev ON l_prev.bucket = 'prev';

`

const SQL_TOTAL_SEGMENTOS = `
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(categoria_estabelecimento), ''), '(Sem categoria)') AS categoria_estabelecimento,
      valor_cupom,
      data_captura
    FROM picmoney_unificada
  )
  SELECT
    categoria_estabelecimento,
    COUNT(*)::bigint                        AS total_ocorrencias,
    COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom,
    COALESCE(AVG(valor_cupom), 0)::numeric AS media_valor_cupom
  FROM base
  WHERE ($1::date IS NULL OR data_captura >= $1::date)
    AND ($2::date IS NULL OR data_captura <  $2::date + INTERVAL '1 day')
  GROUP BY 1
`

const SQL_TOTAL_PARCEIROS = `
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(nome_estabelecimento), ''), '(Sem nome)') AS nome_estabelecimento,
      valor_cupom,
      data_captura
    FROM picmoney_unificada
  )
  SELECT
    nome_estabelecimento,
    COUNT(*)::bigint                        AS total_ocorrencias,
    COALESCE(SUM(valor_cupom), 0)::numeric AS total_valor_cupom,
    COALESCE(AVG(valor_cupom), 0)::numeric AS media_valor_cupom
  FROM base
  WHERE ($1::date IS NULL OR data_captura >= $1::date)
    AND ($2::date IS NULL OR data_captura <  $2::date + INTERVAL '1 day')
  GROUP BY 1
`


router.get("/kpis/receita-total", async (req, res) => {
    try {
      const { rows } = await picboardDB.query(SQL_TOTAL_GERAL)
      const r = rows[0] || {}
      
      res.json({ 
        total_valor_cupom: Number(rows[0].total_valor_cupom ?? 0),
        mes_atual: Number(r.mes_atual ?? 0),
        mes_anterior: Number(r.mes_anterior ?? 0),
        variacao_percent: Number(r.variacao_percent ?? 0),
        trend: r.trend || 'flat'
      })
    } catch (err) {
      console.error("Erro /kpis/receita-total:", err)
      res.status(500).json({ error: "Erro ao calcular total_geral" })
    }
})



router.get("/kpis/receita-liquida", async(req, res) => {
    try{
        const { rows } = await picboardDB.query(SQL_RECEITA_LIQUIDA)
        const r = rows[0] || {}
        
        res.json({
          receita_liquida: Number(rows[0].receita_liquida_total ?? 0),
          mes_atual: Number(r.mes_atual ?? 0),
          mes_anterior: Number(r.mes_anterior ?? 0),
          variacao_percent: Number(r.variacao_percent ?? 0),
          trend: r.trend || 'flat'
        })
    }catch(err){
        console.error("Erro /kpis/receita-liquida: ", err)
        res.status(500).json({error: "Erro ao calcular."})
    }
})


router.get("/kpis/total-segmentos", async (req, res) => {
try {
    const start  = parseDate(req.query.start)
    const end    = parseDate(req.query.end)

    // sort: total | media | qtd | nome
    const sort   = pickOne(req.query.sort, ['total','media','qtd','nome'], 'total')
    const order  = pickOne(req.query.order, ['asc','desc'], 'desc') // padrão: maior→menor
    const limit  = toInt(req.query.limit, 100)
    const offset = toInt(req.query.offset, 0)

    const sortColMap = {
      total: 'total_valor_cupom',
      media: 'media_valor_cupom',
      qtd:   'total_ocorrencias',
      nome:  'categoria_estabelecimento'
    }
    const orderBy = sortColMap[sort]

    const sql = `
      ${SQL_TOTAL_SEGMENTOS}
      ORDER BY ${orderBy} ${order.toUpperCase()}, categoria_estabelecimento
      LIMIT $3 OFFSET $4
    `
    const { rows } = await picboardDB.query({ text: sql, values: [start, end, limit, offset] })

    const data = rows.map(r => ({
      categoria_estabelecimento: r.categoria_estabelecimento,
      total_ocorrencias: Number(r.total_ocorrencias),
      total_valor_cupom: Number(r.total_valor_cupom),
      media_valor_cupom: Number(r.media_valor_cupom),
    }))
    res.json({ filtros: { start, end, sort, order, limit, offset }, seguimentos: data })
  } catch (err) {
    console.error("Erro /kpis/total-segmentos:", err)
    res.status(500).json({ error: "Erro ao calcular total por segmentos" })
  }
})


router.get("/kpis/total-parceiros", async (req, res) => {
    try {
    const start  = parseDate(req.query.start)
    const end    = parseDate(req.query.end)

    // sort: total | media | qtd | nome
    const sort   = pickOne(req.query.sort, ['total','media','qtd','nome'], 'total')
    const order  = pickOne(req.query.order, ['asc','desc'], 'desc') // padrão: maior→menor
    const limit  = toInt(req.query.limit, 100)
    const offset = toInt(req.query.offset, 0)

    const sortColMap = {
      total: 'total_valor_cupom',
      media: 'media_valor_cupom',
      qtd:   'total_ocorrencias',
      nome:  'nome_estabelecimento'
    }
    const orderBy = sortColMap[sort]

    const sql = `
      ${SQL_BASE_PARCEIROS}
      ORDER BY ${orderBy} ${order.toUpperCase()}, nome_estabelecimento
      LIMIT $3 OFFSET $4
    `
    const { rows } = await picboardDB.query({ text: sql, values: [start, end, limit, offset] })

    const data = rows.map(r => ({
      nome_estabelecimento: r.nome_estabelecimento,
      total_ocorrencias: Number(r.total_ocorrencias),
      total_valor_cupom: Number(r.total_valor_cupom),
      media_valor_cupom: Number(r.media_valor_cupom),
    }))
    res.json({ filtros: { start, end, sort, order, limit, offset }, parceiros: data })
  } catch (err) {
    console.error("Erro /kpis/total-parceiros:", err)
    res.status(500).json({ error: "Erro ao calcular total por parceiros" })
  }
})


module.exports = router