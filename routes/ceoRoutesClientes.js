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

const SQL_30Dias = `
  WITH bounds AS (
    SELECT
      ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)                 AS fim,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '29 days') AS ini
  ),
  series AS (
    SELECT generate_series((SELECT ini FROM bounds), (SELECT fim FROM bounds), INTERVAL '1 day')::date AS dia
  ),
  dau AS (
    SELECT
      (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date) AS dia,
      COUNT(DISTINCT id_usuario) AS usuarios
    FROM picmoney_players, bounds
    WHERE ultima_sessao IS NOT NULL
      AND (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date)
          BETWEEN (SELECT ini FROM bounds) AND (SELECT fim FROM bounds)
    GROUP BY 1
  )
  SELECT
    s.dia,
    COALESCE(d.usuarios, 0)::bigint AS usuarios_ativos
  FROM series s
  LEFT JOIN dau d USING (dia)
  ORDER BY s.dia;

`

const SQL_ATIVOS_POR_SEMANA = `
WITH base AS (
  SELECT
    ( (ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo' )::date AS d,
    id_usuario
  FROM picmoney_players
  WHERE ultima_sessao IS NOT NULL
    AND date_trunc(
          'month',
          ( (ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo' )
        ) = date_trunc(
          'month',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
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

const SQL_INATIVOS_POR_MES = `
WITH params AS (
  SELECT
    ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) AS today_sp
),
ult AS (
  SELECT
    id_usuario,
    MAX(((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo'))::date AS ultima_data_sp
  FROM picmoney_players
  GROUP BY id_usuario
),
-- só quem está inativo (>=14d) hoje
inativos AS (
  SELECT
    u.id_usuario,
    u.ultima_data_sp,
    (SELECT today_sp FROM params) - u.ultima_data_sp AS dias_inativos
  FROM ult u, params
    WHERE u.ultima_data_sp IS NOT NULL
      AND u.ultima_data_sp <= ( (SELECT today_sp FROM params) - INTERVAL '14 days')
  ),
  series AS (
    -- últimos $1 meses (inclui o mês atual) no fuso de SP
    SELECT (date_trunc('month', ( (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date ))
            - (INTERVAL '1 month' * gs))::date AS mes
    FROM generate_series(0, $1 - 1) AS gs
  ),
  agregado AS (
    SELECT
      date_trunc('month', i.ultima_data_sp)::date AS mes,
      COUNT(*) FILTER (WHERE i.dias_inativos BETWEEN 14 AND 29)  AS inat_14_29,
      COUNT(*) FILTER (WHERE i.dias_inativos BETWEEN 30 AND 59)  AS inat_30_59,
      COUNT(*) FILTER (WHERE i.dias_inativos BETWEEN 60 AND 89)  AS inat_60_89,
      COUNT(*) FILTER (WHERE i.dias_inativos >= 90)              AS inat_ge_90,
      COUNT(*)                                                   AS inat_ge_14_total
    FROM inativos i
    GROUP BY 1
  )
  SELECT
    s.mes,
    COALESCE(a.inat_14_29, 0)::bigint   AS inativos_14_29,
    COALESCE(a.inat_30_59, 0)::bigint   AS inativos_30_59,
    COALESCE(a.inat_60_89, 0)::bigint   AS inativos_60_89,
    COALESCE(a.inat_ge_90, 0)::bigint   AS inativos_ge_90,
    COALESCE(a.inat_ge_14_total, 0)::bigint AS inativos_ge_14_total
  FROM series s
  LEFT JOIN agregado a ON a.mes = s.mes
  ORDER BY s.mes;

`

const SQL_DISTRIB_TEMPO_SESSAO = `
WITH bounds AS (
  SELECT
    COALESCE($1::date,
      date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))::date
    ) AS ini,
    COALESCE($2::date,
      (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')) + INTERVAL '1 month - 1 day')::date
    ) AS fim
),
base AS (
  SELECT
    tempo_online::numeric AS minutos
  FROM picmoney_players, bounds
  WHERE ultima_sessao IS NOT NULL
    AND (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date)
        BETWEEN (SELECT ini FROM bounds) AND (SELECT fim FROM bounds)
    AND tempo_online IS NOT NULL
),
bucket AS (
  SELECT
    CASE
      WHEN minutos >= 0  AND minutos < 15  THEN '0-15'
      WHEN minutos >= 15 AND minutos < 30  THEN '15-30'
      WHEN minutos >= 30 AND minutos < 45  THEN '30-45'
      WHEN minutos >= 45 AND minutos < 60  THEN '45-60'
      WHEN minutos >= 60 AND minutos < 90  THEN '60-90'
      WHEN minutos >= 90 AND minutos < 120 THEN '90-120'
      WHEN minutos >= 120 AND minutos <= 180 THEN '120-180'
      ELSE '>180'
    END AS faixa
  FROM base
)
SELECT
  faixa,
  COUNT(*)::bigint AS sessoes
FROM bucket
GROUP BY faixa
ORDER BY
  CASE faixa
    WHEN '0-15' THEN 1
    WHEN '15-30' THEN 2
    WHEN '30-45' THEN 3
    WHEN '45-60' THEN 4
    WHEN '60-90' THEN 5
    WHEN '90-120' THEN 6
    WHEN '120-180' THEN 7
    ELSE 8
  END;
`

const SQL_SESSOES_POR_USUARIO = `
  WITH bounds AS (
    SELECT
      COALESCE($1::date,
        date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))::date
      ) AS ini,
      COALESCE($2::date,
        (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')) + INTERVAL '1 month - 1 day')::date
      ) AS fim
  )
  SELECT
    id_usuario,
    COUNT(*)::bigint AS qtd_sessoes
  FROM picmoney_players, bounds
  WHERE ultima_sessao IS NOT NULL
    AND (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date)
        BETWEEN (SELECT ini FROM bounds) AND (SELECT fim FROM bounds)
  GROUP BY id_usuario
  ORDER BY qtd_sessoes DESC, id_usuario;
`

const SQL_USUARIOS_POR_ZONA = `
  WITH bounds AS (
    SELECT
      COALESCE($1::date,
        date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))::date
      ) AS ini,
      COALESCE($2::date,
        (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')) + INTERVAL '1 month - 1 day')::date
      ) AS fim
  ),
  base AS (
    -- 1 linha por usuario/zona no período (evita duplicar o mesmo usuário)
    SELECT DISTINCT
      id_usuario,
      COALESCE(NULLIF(TRIM(zona), ''), '(Sem zona)') AS zona_norm
    FROM picmoney_players, bounds
    WHERE ultima_sessao IS NOT NULL
      AND (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date)
          BETWEEN (SELECT ini FROM bounds) AND (SELECT fim FROM bounds)
  ),
  agg AS (
    SELECT zona_norm AS zona, COUNT(DISTINCT id_usuario)::bigint AS total_usuarios
    FROM base
    GROUP BY zona_norm
  ),
  tot AS (
    SELECT SUM(total_usuarios) AS total_geral FROM agg
  )
  SELECT
    a.zona,
    a.total_usuarios,
    ROUND( (a.total_usuarios::numeric / NULLIF(t.total_geral,0)) * 100, 2) AS percentual
  FROM agg a CROSS JOIN tot t
  ORDER BY a.total_usuarios DESC, a.zona
`

function pickBairroColumn(tipo) {
  const allowed = new Set(['bairro_residencial', 'bairro_trabalho', 'bairro_escola'])
  if (!allowed.has(tipo)) return 'bairro_residencial'
  return tipo;
}

function buildSQLUsuariosPorBairro(col) {
  return `
  WITH bounds AS (
    SELECT
      COALESCE($1::date,
        date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))::date
      ) AS ini,
      COALESCE($2::date,
        (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')) + INTERVAL '1 month - 1 day')::date
      ) AS fim
  ),
  base AS (
    SELECT DISTINCT
      id_usuario,
      COALESCE(NULLIF(TRIM(${col}), ''), '(Sem bairro)') AS bairro_norm
    FROM picmoney_players, bounds
    WHERE ultima_sessao IS NOT NULL
      AND (((ultima_sessao::timestamptz) AT TIME ZONE 'America/Sao_Paulo')::date)
          BETWEEN (SELECT ini FROM bounds) AND (SELECT fim FROM bounds)
  ),
  agg AS (
    SELECT bairro_norm AS bairro, COUNT(DISTINCT id_usuario)::bigint AS total_usuarios
    FROM base
    GROUP BY bairro_norm
  ),
  tot AS (
    SELECT SUM(total_usuarios) AS total_geral FROM agg
  )
  SELECT
    a.bairro,
    a.total_usuarios,
    ROUND( (a.total_usuarios::numeric / NULLIF(t.total_geral,0)) * 100, 2) AS percentual
  FROM agg a CROSS JOIN tot t
  ORDER BY a.total_usuarios DESC, a.bairro
`}




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

router.get('/kpis/usuarios-inativos/por-mes', async (req, res) => {
  try {
    const meses = Math.max(1, Math.min(36, Number(req.query.meses || 6)))
    const { rows } = await picboardDB.query(SQL_INATIVOS_POR_MES, [meses])
    const data = rows.map(r => ({
      mes: r.mes,
      inativos_14_29: Number(r.inativos_14_29),
      inativos_30_59: Number(r.inativos_30_59),
      inativos_60_89: Number(r.inativos_60_89),
      inativos_ge_90: Number(r.inativos_ge_90),
      inativos_ge_14_total: Number(r.inativos_ge_14_total)
    }));
    res.json({ meses, data })
  } catch (err) {
    console.error('Erro /kpis/inativos/por-mes:', err)
    res.status(500).json({ error: 'Erro ao calcular inativos por faixas e mês' })
  }
})

router.get('/kpis/ativos-por-semana', async (_req, res) => {
  try {
    const { rows } = await picboardDB.query(SQL_ATIVOS_POR_SEMANA)
    res.json(rows.map(r => ({
      dia_semana: r.dia_semana,
      usuarios_ativos_mes: Number(r.usuarios_ativos_mes),
      media_diaria_no_mes: Number(r.media_diaria_no_mes)
    })))
  } catch (err) {
    console.error('Erro /kpis/ativos-por-semana:', err)
    res.status(500).json({ error: 'Erro ao calcular ativos por semana' })
  }
})


router.get('/kpis/ultimos-30d', async (_req, res) => {
  try {
    const { rows } = await picboardDB.query(SQL_30Dias)
    res.json({ range: 'last_30_days', data: rows })
  } catch (err) {
    console.error('Erro /kpis/dau-ultimos-30d:', err)
    res.status(500).json({ error: 'Erro ao calcular DAU dos últimos 30 dias' })
  }
})


router.get('/kpis/tempo-sessao/time', async (req, res) => {
  try {
    const start = req.query.start ? String(req.query.start) : null
    const end   = req.query.end ? String(req.query.end) : null

    const { rows } = await picboardDB.query(SQL_DISTRIB_TEMPO_SESSAO, [start, end])
    const data = rows.map(r => ({ faixa: r.faixa, sessoes: Number(r.sessoes) }))

    res.json({
      periodo: { start: start || 'mes_atual', end: end || 'mes_atual' },
      data
    })
  } catch (err) {
    console.error('Erro /kpis/tempo-sessao/distrib:', err)
    res.status(500).json({ error: 'Erro ao calcular distribuição do tempo de sessão' })
  }
})

router.get('/kpis/sessoes-por-usuario', async (req, res) => {
  try {
    const start = req.query.start ? String(req.query.start) : null
    const end   = req.query.end ? String(req.query.end) : null
    const limit = Math.max(1, Math.min(50000, Number(req.query.limit || 1000)))

    const { rows } = await picboardDB.query(SQL_SESSOES_POR_USUARIO, [start, end])
    const data = rows.slice(0, limit).map(r => ({
      id_usuario: r.id_usuario,
      qtd_sessoes: Number(r.qtd_sessoes)
    }))

    res.json({
      periodo: { start: start || 'mes_atual', end: end || 'mes_atual' },
      total_usuarios: rows.length,
      data
    })
  } catch (err) {
    console.error('Erro /kpis/sessoes-por-usuario:', err)
    res.status(500).json({ error: 'Erro ao calcular sessões por usuário' })
  }
})

router.get('/kpis/usuarios-por-zona', async (req, res) => {
  try {
    const start = req.query.start ? String(req.query.start) : null
    const end   = req.query.end ? String(req.query.end) : null

    const { rows } = await picboardDB.query(SQL_USUARIOS_POR_ZONA, [start, end])
    res.json({
      periodo: { start: start || 'mes_atual', end: end || 'mes_atual' },
      data: rows.map(r => ({
        zona: r.zona,
        total_usuarios: Number(r.total_usuarios)
      }))
    })
  } catch (err) {
    console.error('Erro /kpis/usuarios-por-zona:', err)
    res.status(500).json({ error: 'Erro ao calcular usuários por zona' })
  }
})

router.get('/kpis/usuarios-por-bairro', async (req, res) => {
  try {
    const tipo = pickBairroColumn(String(req.query.tipo || 'bairro_residencial'))
    const start = req.query.start ? String(req.query.start) : null
    const end   = req.query.end ? String(req.query.end) : null
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)))

    const SQL = buildSQLUsuariosPorBairro(tipo)
    const { rows } = await picboardDB.query(SQL, [start, end])

    const data = rows.slice(0, limit).map(r => ({
      bairro: r.bairro,
      total_usuarios: Number(r.total_usuarios),
      percentual: Number(r.percentual)
    }))

    res.json({
      periodo: { start: start || 'mes_atual', end: end || 'mes_atual' },
      tipo, 
      total_bairros: rows.length,
      data
    })
  } catch (err) {
    console.error('Erro /kpis/usuarios-por-bairro:', err)
    res.status(500).json({ error: 'Erro ao calcular usuários por bairro' })
  }
})

module.exports = router