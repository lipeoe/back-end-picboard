const picboardDB = require("../db/db.js")

const dayjs = require('dayjs')
const customParse = require('dayjs/plugin/customParseFormat')
dayjs.extend(customParse)

function toPgTimestamp(dateBR, timeHM) {
  const d = dayjs(`${dateBR} ${timeHM}`, 'DD/MM/YYYY HH:mm', true)
  if (!d.isValid()) {

    return dayjs().toDate()
  }
  return d.toDate()
}


function toPgDate(dateBR) {
  const d = dayjs(dateBR, 'DD/MM/YYYY', true)
  return d.isValid() ? d.format('YYYY-MM-DD') : dateBR
}


const COLS = [
  'data_captura','hora','nome_estabelecimento','categoria_estabelecimento',
  'bairro_estabelecimento','id_campanha','id_cupom','tipo_cupom','produto',
  'valor_cupom','valor_compra','repasse_picmoney','local_captura','cep','zona'
]

function toParams(row) {
  const dataISO = toPgDate(row.data_captura)
  const horaTS  = toPgTimestamp(row.data_captura, row.hora)
  return [
    dataISO, horaTS, row.nome_estabelecimento, row.categoria_estabelecimento,
    row.bairro_estabelecimento, row.id_campanha, row.id_cupom, row.tipo_cupom, row.produto,
    row.valor_cupom, row.valor_compra, row.repasse_picmoney, row.local_captura, row.cep, row.zona
  ]
}

async function insertBatch(rows, tableName = process.env.PG_TABLE || 'picmoney_unificada') {
  if (!rows.length) return 0

  const placeholders = rows.map((_, i) => {
    const base = i * COLS.length;
    const p = COLS.map((__, j) => `$${base + j + 1}`);
    return `(${p.join(',')})`;
  }).join(',')

  const sql = `INSERT INTO ${tableName} (${COLS.join(',')}) VALUES ${placeholders};`
  const params = rows.flatMap(toParams)
  const client = await picboardDB.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql, params)
    await client.query('COMMIT')
    return rows.length
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Insert batch error:', e)
    throw e
  } finally {
    client.release()
  }
}

module.exports = { insertBatch }
