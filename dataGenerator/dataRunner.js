require('dotenv').config();
const { generateBatch } = require('./generator')
const { insertBatch } = require('./sqlInsertData')

async function runOnce({
  count = Number(process.env.SEED_COUNT || 200),
  perHourMin = Number(process.env.SEED_PER_HOUR_MIN || 1),
  perHourMax = Number(process.env.SEED_PER_HOUR_MAX || 3),
  year = Number(process.env.SEED_YEAR || new Date().getFullYear()),
  seed = process.env.SEED_SEED ?? ''
} = {}) {
  const rows = generateBatch({ count, perHourMin, perHourMax, year, seed })
  const inserted = await insertBatch(rows)
  console.log(`✅ Inseridos ${inserted} registros no Postgres`)
}

module.exports = { runOnce }
