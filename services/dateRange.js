const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}


function buildDateRange({ preset, from, to }) {

  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) {
      throw new Error("Parâmetros 'from' e 'to' devem estar no formato YYYY-MM-DD.")
    }
    if (fromDate > toDate) {
      throw new Error("'from' não pode ser maior que 'to'.")
    }
    return { type: 'window', from: toISODate(fromDate), to: toISODate(toDate) }
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const presetNorm = (preset || 'last_30d').toLowerCase()

  if (presetNorm === 'all_time') {
    return { type: 'all_time' }
  }

  if (presetNorm === 'last_30d') {
    const start = new Date(today.getTime() - (29 * DAY_MS));
    return { type: 'window', from: toISODate(start), to: toISODate(today) }
  }

  if (presetNorm === 'last_3m' || presetNorm === 'last_6m') {
    const months = presetNorm === 'last_3m' ? 3 : 6
    const start = new Date(today)
    start.setMonth(start.getMonth() - months)

    return { type: 'window', from: toISODate(start), to: toISODate(today) }
  }


  const start = new Date(today.getTime() - (29 * DAY_MS))
  return { type: 'window', from: toISODate(start), to: toISODate(today) }
}

module.exports = { buildDateRange }
