function cepToInt(cepStr){
    const digits = cepStr.replace(/\D/g, "")
    return parseInt(digits, 10)
}

function intToCep(num){
    const s = String(num).padStart(8, "0")
    return `${s.slice(0,5)}-${s.slice(5)}`
}

function randomCep(cepInicio, cepFim, rng){
    const min = cepToInt(cepInicio)
    const max = cepToInt(cepFim)
    const pick = min + Math.floor(rng()*(max - min + 1))
    return intToCep(pick)
}

module.exports = { randomCep }