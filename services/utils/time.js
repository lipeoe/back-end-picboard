const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('America/Sao_Paulo')


function randomDateInRange(year, monthStart = 5, monthEnd = 11, rnd) {
  const month = Math.floor(monthStart + rnd() * (monthEnd - monthStart + 1))
  const first = dayjs.tz(`${year}-${String(month).padStart(2, '0')}-01`)
  const daysInMonth = first.daysInMonth()
  const day = 1 + Math.floor(rnd() * daysInMonth)
  return first.date(day)
}


function randomHourByCategory(category, rnd) {
  const map = {
    Restaurante: [11, 22],
    'Esporte & Fitness': [6, 23],
    'Supermercado & Conveniência': [8, 22],
    Papelaria: [9, 21],
    Livraria: [9, 21],
    Farmácia: [8, 22],
    Moda: [10, 22],
    'Eletro & Móveis': [10, 22],
    Cafeteria: [7, 22],
    Saúde: [7, 20],
    'Clínicas Médicas e Laboratórios': [7, 20],
    'Clube / Cultura & Esporte': [8, 23],
  }

  const [startH, endH] = map[category] || [9, 19]
  const h = Math.floor(startH + rnd() * (endH - startH + 1))
  const m = Math.floor(rnd() * 60)
  return { hour: h, minute: m }
}

function fmtBR(d) {
  return d.format('DD/MM/YYYY')
}

function fmtHM(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

module.exports = { randomDateInRange, randomHourByCategory, fmtBR, fmtHM }
