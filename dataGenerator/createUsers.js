const picboardDB = require('../db/db');
const dayjs = require('dayjs');
const { Faker, pt_BR } = require('@faker-js/faker')

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDateInLastNDays(nDays = 365) {
  const now = dayjs();
  const daysBack = randomInt(0, nDays);
  return now.subtract(daysBack, 'day').format('YYYY-MM-DD')
}

async function getExistingCategories(table = 'picmoney_players') {
  const { rows } = await picboardDB.query(`
    SELECT DISTINCT categoria_frequentada
    FROM ${table}
    WHERE categoria_frequentada IS NOT NULL AND btrim(categoria_frequentada) <> ''
    LIMIT 2000;
  `)
  const cats = rows.map(r => String(r.categoria_frequentada)).filter(Boolean)
  if (cats.length) return cats
  return [
    "Restaurante", "Esporte & Fitness", "Supermercado & Conveniência", "Papelaria",
    "Livraria", "Farmácia", "Moda", "Eletro & Móveis", "Cafeteria", "Saúde"
  ]
}

async function idExists(userId, table = 'picmoney_players') {
  const { rows } = await picboardDB.query(`SELECT 1 FROM ${table} WHERE id_usuario = $1 LIMIT 1;`, [userId])
  return rows.length > 0
}

async function generateUniqueUserId(prefix = 'USR-', table = 'picmoney_players') {
 
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (;;) {
    let id = prefix;
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
    if (!(await idExists(id, table))) return id
  }
}


async function createUsers({
  count = 10,
  table = 'picmoney_players',
  batchSize = 800
}) {
  const faker = new Faker({ locale: [pt_BR] })
  const categoriasPool = await getExistingCategories(table)
  const zonasPool = ['Norte', 'Sul', 'Leste', 'Oeste', 'Centro']
  const sexos = ['M', 'F']

  const { rows: colsRows } = await picboardDB.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `, [table])
  const tableCols = colsRows.map(r => r.column_name)

  const expectedCols = [
    'data_nascimento','idade','sexo','cidade_residencial','bairro_residencial',
    'cidade_trabalho','bairro_trabalho','cidade_escola','bairro_escola',
    'sessoes','ultima_sessao','id_usuario','tempo_online','pegou_cupom',
    'categoria_frequentada','zona','data_cadastro'
  ]
  const cols = expectedCols.filter(c => tableCols.includes(c))

  const rows = []
  for (let i = 0; i < count; i++) {
    const id_usuario = await generateUniqueUserId('USR-', table)

    const data_cadastro = randomDateInLastNDays(365)

    const ultima_sessao = dayjs(data_cadastro).add(randomInt(0, 180), 'day')
    const ultima_sessao_str = ultima_sessao.isAfter(dayjs()) ? dayjs().format('YYYY-MM-DD') : ultima_sessao.format('YYYY-MM-DD')

    const idade = randomInt(18, 65)
    const sexo = pickOne(sexos)
    const cidade = 'São Paulo'
    const bairros = ['Bela Vista', 'Pinheiros', 'Liberdade', 'Moema', 'Tatuapé', 'Jardins', 'Santana', 'Vila Mariana']
    const bairro = pickOne(bairros)

    const row = {
      data_nascimento: dayjs().subtract(idade, 'year').subtract(randomInt(0, 365), 'day').format('YYYY-MM-DD'),
      idade,
      sexo,
      cidade_residencial: cidade,
      bairro_residencial: bairro,
      cidade_trabalho: cidade,
      bairro_trabalho: pickOne(bairros),
      cidade_escola: cidade,
      bairro_escola: pickOne(bairros),
      sessoes: 1,
      ultima_sessao: ultima_sessao_str,
      id_usuario,
      tempo_online: randomInt(5, 180),
      pegou_cupom: pickOne(['Sim', 'Não']),
      categoria_frequentada: pickOne(categoriasPool),
      zona: pickOne(['Norte', 'Sul', 'Leste', 'Oeste', 'Centro']),
      data_cadastro
    }

    const pruned = {};
    for (const c of cols) pruned[c] = row[c] ?? null
    rows.push(pruned)
  }

  if (!rows.length) return 0

  const colList = Object.keys(rows[0])
  let inserted = 0

  for (let start = 0; start < rows.length; start += batchSize) {
    const slice = rows.slice(start, start + batchSize)
    const placeholders = []
    const values = []
    slice.forEach((r, i) => {
      const base = i * colList.length;
      placeholders.push(`(${colList.map((_, j) => `$${base + j + 1}`).join(',')})`)
      values.push(...colList.map(c => r[c]))
    })

    const sql = `INSERT INTO ${table} (${colList.join(',')}) VALUES ${placeholders.join(',')};`
    await picboardDB.query({ text: sql, values })
    inserted += slice.length
  }

  return inserted
}

module.exports = { createUsers }
