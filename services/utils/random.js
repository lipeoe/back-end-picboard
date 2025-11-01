
const { Faker, pt_BR } = require('@faker-js/faker');

function seedFromAny(seedInput) {
  if (seedInput === undefined || seedInput === null || seedInput === '') return null
  if (typeof seedInput === 'number' && Number.isFinite(seedInput)) return seedInput >>> 0
  const s = String(seedInput);
  return s.split('').reduce((a, c) => (a + c.charCodeAt(0)) >>> 0, 0)
}

function makeRNG(seedInput = '') {
  const faker = new Faker({ locale: [pt_BR] })
  const seed = seedFromAny(seedInput)
  if (seed !== null) faker.seed(seed)
  const rnd = () => faker.number.float({ min: 0, max: 1, multipleOf: 0.0000001 })
  return { faker, rnd }
}

function pickOne(arr, rng) {
  return arr[Math.floor(rng() * arr.length)]
}

function uuid12(faker) {
  return faker.string.uuid().replace(/-/g, '').slice(0, 12)
}

function currencyBetween(faker, min = 10, max = 500, decimals = 2) {
  const val = faker.number.float({ min, max, precision: Math.pow(10, -decimals) })
  return Number(val.toFixed(decimals))
}

module.exports = { makeRNG, pickOne, uuid12, currencyBetween }
