const express = require('express')
const router = express.Router()
const picboardDB = require("../db/db")

const SQL_TOTAL_CLIENTES = `
      WITH usuarios_mes_atual AS (
    SELECT COUNT(DISTINCT id_usuario) AS total
    FROM picmoney_players
    WHERE DATE_TRUNC('month', data_cadastro) = DATE_TRUNC('month', CURRENT_DATE)
  ),
  usuarios_mes_anterior AS (
    SELECT COUNT(DISTINCT id_usuario) AS total
    FROM picmoney_players
    WHERE DATE_TRUNC('month', data_cadastro) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
  ),
  total_geral AS (
    SELECT COUNT(DISTINCT id_usuario) AS total
    FROM picmoney_players
  )
  SELECT 
    t.total AS total_geral,
    ma.total AS mes_atual,
    pa.total AS mes_anterior,
    ROUND(
      CASE 
        WHEN pa.total > 0 THEN ((ma.total - pa.total) / pa.total::numeric) * 100
        ELSE NULL
      END
    , 2) AS variacao_percent,
    CASE 
      WHEN pa.total IS NULL OR pa.total = 0 THEN 'new'
      WHEN ma.total > pa.total THEN 'up'
      WHEN ma.total < pa.total THEN 'down'
      ELSE 'flat'
    END AS trend
  FROM total_geral t, usuarios_mes_atual ma, usuarios_mes_anterior pa;

`

const SQL_PRINCIPAIS_CATEGORIAS = `
  SELECT
    COALESCE(NULLIF(TRIM(categoria_frequentada), ''), '(Sem categoria)') AS categoria_frequentada,
    COUNT(*)::bigint AS total_usuarios,
    COUNT(*) FILTER (WHERE pegou_cupom ILIKE 'Sim')::bigint AS total_pegou_cupom,
    ROUND(
      CASE WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (WHERE pegou_cupom ILIKE 'Sim'))::numeric / COUNT(*)::numeric * 100
        ELSE 0 END
    , 2) AS percentual_cupom
  FROM picmoney_players
  GROUP BY 1
  ORDER BY total_usuarios DESC, categoria_frequentada
  -- LIMIT 20
`

const SQL_RETENCAO = `
WITH sess AS (
  SELECT DISTINCT id_usuario,
         (ultima_sessao::timestamp)::date AS dt
  FROM picmoney_players
  WHERE ultima_sessao IS NOT NULL
),
cur AS (
  SELECT DISTINCT id_usuario
  FROM sess
  WHERE date_trunc('month', dt) = date_trunc('month', CURRENT_DATE)
),
prev AS (
  SELECT DISTINCT id_usuario
  FROM sess
  WHERE date_trunc('month', dt) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
),
retidos AS (
  SELECT COUNT(*) AS qty
  FROM prev p
  JOIN cur  c USING (id_usuario)
)
SELECT
  (SELECT COUNT(*) FROM prev)  AS usuarios_prev,
  (SELECT COUNT(*) FROM cur)   AS usuarios_cur,
  (SELECT qty FROM retidos)    AS usuarios_retidos,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM prev) > 0
         THEN ((SELECT qty FROM retidos)::numeric / (SELECT COUNT(*)::numeric FROM prev)) * 100
         ELSE NULL END
  , 2) AS retention_percent;
`

const SQL_ATIVOS_POR_SEMANA = `
  WITH base AS (
    SELECT (ultima_sessao::timestamp)::date AS d, id_usuario
    FROM picmoney_players
    WHERE ultima_sessao IS NOT NULL
      AND date_trunc('month', (ultima_sessao::timestamp)) = date_trunc('month', CURRENT_DATE)
  ),
  agg AS (
    SELECT d,
           COUNT(DISTINCT id_usuario) AS dau,
           EXTRACT(DOW FROM d) AS dow
    FROM base
    GROUP BY d
  )
  SELECT
    CASE dow
      WHEN 1 THEN 'segunda'
      WHEN 2 THEN 'terça'
      WHEN 3 THEN 'quarta'
      WHEN 4 THEN 'quinta'
      WHEN 5 THEN 'sexta'
      WHEN 6 THEN 'sábado'
      WHEN 0 THEN 'domingo'
    END AS dia_semana,
    CASE dow
      WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3
      WHEN 4 THEN 4 WHEN 5 THEN 5 WHEN 6 THEN 6
      WHEN 0 THEN 7
    END AS ordem_semana,
    SUM(dau) AS usuarios_ativos_mes,
    ROUND(AVG(dau)::numeric, 2) AS media_diaria_no_mes
  FROM agg
  GROUP BY dow
  ORDER BY
    CASE dow
      WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3
      WHEN 4 THEN 4 WHEN 5 THEN 5 WHEN 6 THEN 6
      WHEN 0 THEN 7
    END;
`

const SQL_INATIVOS_14_POR_MES = `
WITH ult AS (
  SELECT
    id_usuario,
    MAX(((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo'))::date AS ultima_data_sp
  FROM picmoney_players
  GROUP BY id_usuario
),
inativos AS (
  SELECT
    id_usuario,
    ultima_data_sp
  FROM ult
  WHERE ultima_data_sp IS NOT NULL
    AND ultima_data_sp <= CURRENT_DATE - INTERVAL '14 days'
),
series AS (
  -- últimos $1 meses, incluindo o mês atual
  SELECT (date_trunc('month', CURRENT_DATE) - (INTERVAL '1 month' * gs))::date AS mes
  FROM generate_series(0, $1 - 1) AS gs
)
SELECT
  s.mes,                                            -- YYYY-MM-01
  COALESCE(COUNT(i.id_usuario), 0)::bigint AS inativos_14d
FROM series s
LEFT JOIN inativos i
  ON date_trunc('month', i.ultima_data_sp) = s.mes
GROUP BY s.mes
ORDER BY s.mes;
`



router.get("/kpis/usuarios", async (req, res) => {
  try {
    const { rows } = await picboardDB.query(SQL_TOTAL_CLIENTES)
    const r = rows[0]

    res.json({
      total_usuarios: Number(r.total_geral ?? 0),
      mes_atual: Number(r.mes_atual ?? 0),
      mes_anterior: Number(r.mes_anterior ?? 0),
      variacao_percent: r.variacao_percent === null ? null : Number(r.variacao_percent),
      trend: r.trend
    })
  } catch (err) {
    console.error("Erro /kpis/usuarios:", err)
    res.status(500).json({ error: "Erro ao calcular usuários e variação mensal" })
  }
})

router.get("/kpis/principais-categorias", async (req, res) => {
  try {
    const { rows } = await picboardDB.query(SQL_PRINCIPAIS_CATEGORIAS)

    const data = rows.map(r => ({
      categoria_frequentada: r.categoria_frequentada,
      total_usuarios: Number(r.total_usuarios),
      total_pegou_cupom: Number(r.total_pegou_cupom),
      percentual_cupom: Number(r.percentual_cupom)
    }))

    res.json({ principais_categorias: data })
  } catch (err) {
    console.error("Erro /kpis/principais-categorias:", err);
    res.status(500).json({ error: "Erro ao calcular principais categorias" })
  }
})

router.get('/kpis/retencao', async (_req, res) => {
  try {
    const { rows } = await picboardDB.query(SQL_RETENCAO)
    const r = rows[0] || {}
    res.json({
      usuarios_prev: Number(r.usuarios_prev ?? 0),
      usuarios_cur: Number(r.usuarios_cur ?? 0),
      usuarios_retidos: Number(r.usuarios_retidos ?? 0),
      retencao_percentual: Number(r.retention_percent ?? 0)
    })
  } catch (err) {
    console.error('Erro /kpis/retencao:', err)
    res.status(500).json({ error: 'Erro ao calcular retenção' })
  }
})

router.get('/kpis/inativos-14/por-mes', async (req, res) => {
  try {
    const meses = Math.max(1, Math.min(36, Number(req.query.meses || 6)))
    const { rows } = await picboardDB.query(SQL_INATIVOS_14_POR_MES, [meses])

    const data = rows.map(r => ({
      mes: r.mes,                                  // 'YYYY-MM-01'
      inativos_qnt: Number(r.inativos_14d)
    }))

    res.json({ inativos_14_por_mes: data, meses })
  } catch (err) {
    console.error('Erro /kpis/inativos-14/por-mes:', err)
    res.status(500).json({ error: 'Erro ao calcular inativos >14 dias por mês' })
  }
})


module.exports = router