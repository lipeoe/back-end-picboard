const picboardDB = require('../db/db')
const dayjs = require('dayjs')

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function randomDateInLastNDays(nDays = 40) {
  const now = dayjs();
  const daysBack = randomInt(0, nDays)
  const d = now.subtract(daysBack, 'day')
  return d.format('YYYY-MM-DD')
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function getExistingCategories(table = 'picmoney_players') {
  const sql = `
    SELECT DISTINCT categoria_frequentada
    FROM ${table}
    WHERE categoria_frequentada IS NOT NULL
      AND btrim(categoria_frequentada) <> ''
    LIMIT 1000;
  `
  const { rows } = await picboardDB.query(sql)
  const cats = rows.map(r => String(r.categoria_frequentada)).filter(Boolean)
  if (cats.length) return cats


  return [
    "Restaurante", "Esporte & Fitness", "Supermercado & Conveniência", "Papelaria",
    "Livraria", "Farmácia", "Moda", "Eletro & Móveis", "Cafeteria", "Saúde"
  ]
}

async function getBaselineRowByUserId(userId, table = 'picmoney_players') {
  const { rows } = await picboardDB.query(
    `SELECT * FROM ${table} WHERE id_usuario = $1 LIMIT 1;`,
    [userId]
  )
  return rows[0] || null
}


async function createSessionsForUser({
  userId,
  minSessions = 1,
  maxSessions = 3,
  lastNDays = 60,
  table = 'picmoney_players',
  batchSize = 800
}) {
  if (!userId) throw new Error('userId é obrigatório')

  const baseline = await getBaselineRowByUserId(userId, table)
  if (!baseline) {
    throw new Error(`Usuário ${userId} não encontrado em ${table}`)
  }

  const categoriasPool = await getExistingCategories(table)
  const zonasPool = ['Norte', 'Sul', 'Leste', 'Oeste', 'Centro']


  const expectedCols = [
    'data_nascimento','idade','sexo','cidade_residencial','bairro_residencial',
    'cidade_trabalho','bairro_trabalho','cidade_escola','bairro_escola',
    'sessoes','ultima_sessao','id_usuario','tempo_online','pegou_cupom',
    'categoria_frequentada','zona','data_cadastro'
  ]
  const cols = expectedCols.filter(c => Object.prototype.hasOwnProperty.call(baseline, c))

  const sessionsToCreate = randomInt(minSessions, maxSessions)
  const rows = []

  for (let i = 0; i < sessionsToCreate; i++) {
    const row = {}

    for (const c of cols) row[c] = baseline[c]

    if (cols.includes('ultima_sessao')) row.ultima_sessao = randomDateInLastNDays(lastNDays)
    if (cols.includes('tempo_online'))  row.tempo_online  = randomInt(5, 180)
    if (cols.includes('pegou_cupom'))   row.pegou_cupom   = pickOne(['Sim', 'Não'])
    if (cols.includes('categoria_frequentada')) row.categoria_frequentada = pickOne(categoriasPool)
    if (cols.includes('zona')) row.zona = pickOne(zonasPool)

    rows.push(row)
  }

  if (!rows.length) return 0

  const colList = cols;
  const placeholders = []
  const values = [];
  rows.forEach((r, i) => {
    const base = i * colList.length
    placeholders.push(`(${colList.map((_, j) => `$${base + j + 1}`).join(',')})`)
    values.push(...colList.map(c => r[c]))
  })

  const sql = `
    INSERT INTO ${table} (${colList.join(',')})
    VALUES ${placeholders.join(',')};
  `

 
  let inserted = 0
  if (rows.length <= batchSize) {
    await picboardDB.query({ text: sql, values })
    inserted = rows.length
  } else {
    for (let start = 0; start < rows.length; start += batchSize) {
      const slice = rows.slice(start, start + batchSize)
      const p = []
      const v = []
      slice.forEach((r, i) => {
        const base = i * colList.length;
        p.push(`(${colList.map((_, j) => `$${base + j + 1}`).join(',')})`)
        v.push(...colList.map(c => r[c]))
      })
      const sqli = `INSERT INTO ${table} (${colList.join(',')}) VALUES ${p.join(',')};`
      await picboardDB.query({ text: sqli, values: v })
      inserted += slice.length
    }
  }

  return inserted
}

module.exports = { createSessionsForUser }
