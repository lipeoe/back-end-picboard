// jobs/scheduler.js
const cron = require('node-cron')
const { createSessionsForUser } = require('../dataGenerator/genSessions')
const { createUsers } = require('../dataGenerator/createUsers')
const picboardDB = require('../db/db.js')

const ENABLE_JOBS = process.env.ENABLE_SIM_JOBS === 'true'


async function pickRandomUserIds(limit = 10) {
  const { rows } = await picboardDB.query(`SELECT id_usuario FROM picmoney_players ORDER BY random() LIMIT $1`, [limit]);
  return rows.map(r => r.id_usuario)
}

async function jobCreateSessions() {
  try {
    const ids = await pickRandomUserIds(Number(process.env.SIM_USERS_PER_RUN || 10))
    let total = 0;
    for (const id of ids) {
      const inserted = await createSessionsForUser({
        userId: id,
        minSessions: Number(process.env.SIM_MIN_SESSIONS || 1),
        maxSessions: Number(process.env.SIM_MAX_SESSIONS || 3),
        lastNDays: Number(process.env.SIM_DAYS || 180),
        table: process.env.PLAYERS_TABLE || 'picmoney_players'
      });
      total += inserted
    }
    console.log(`[SIM] createSessions job inserted ${total} rows`)
  } catch (e) {
    console.error('[SIM] createSessions error', e)
  }
}

async function jobCreateUsers() {
  try {
    const count = Number(process.env.SIM_NEW_USERS || 5);
    const inserted = await createUsers({ count, table: process.env.PLAYERS_TABLE || 'picmoney_players' });
    console.log(`[SIM] createUsers job inserted ${inserted} users`)
  } catch (e) {
    console.error('[SIM] createUsers error', e)
  }
}

function startScheduler() {
  if (!ENABLE_JOBS) {
    console.log('Simulation jobs disabled (ENABLE_SIM_JOBS != true)')
    return
  }


  cron.schedule(process.env.SIM_SESSIONS_CRON || '*/10 * * * *', () => {
    console.log('[SIM] running createSessions job')
    jobCreateSessions()
  })


  cron.schedule(process.env.SIM_USERS_CRON || '0 1 * * *', () => {
    console.log('[SIM] running createUsers job')
    jobCreateUsers()
  })

  console.log('Simulation scheduler started (node-cron)')
}

module.exports = { startScheduler }
