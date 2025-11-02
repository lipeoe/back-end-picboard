// dataGenerator/generator.js
const fs = require('fs');
const path = require('path');
const { makeRNG, pickOne, uuid12, currencyBetween } = require('../services/utils/random');
const { randomCep } = require('../services/utils/cep');
const { randomDateInRange, randomHourByCategory, fmtBR, fmtHM } = require('../services/utils/time');

function loadJSON(relPath) {
  const abs = path.resolve(__dirname, relPath); // robusto ao cwd
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function inferProduto(category, tipo) {
  const c = (category || "").toLowerCase();
  const t = (tipo || "").toLowerCase();
  if (c.includes("esporte")) return (t === "desconto" ? "Desconto academia" : "Plano de academia");
  if (c.includes("restaur")) return (t === "desconto" ? "Desconto refeição" : "Refeição");
  if (c.includes("papelaria")) return "Material escolar";
  if (c.includes("supermercado")) return "Itens de mercado";
  if (c.includes("livraria")) return "Livro";
  if (c.includes("farmácia")) return "Medicamentos/Perfumaria";
  if (c.includes("eletro") || c.includes("móveis")) return "Eletrodoméstico";
  if (c.includes("moda")) return "Vestuário/Acessórios";
  if (c.includes("cafeteria")) return "Bebida/Alimento";
  if (c.includes("saúde") || c.includes("clínica")) return "Exame/Procedimento";
  return "Produto";
}

function estimateRepasse(valor_cupom, valor_compra) {
  if (valor_cupom && valor_cupom > 0) return Number((valor_cupom * 0.13).toFixed(2));
  if (valor_compra && valor_compra > 0) return Number((valor_compra * 0.07).toFixed(2));
  return 0;
}

function generateBatch({
  seed = "",
  year = 2025,
  count = 100,
  perHourMin = 1,
  perHourMax = 3,
  macroPath = "./dataCEP.json",
  catalogPath = "./dataLojas.json",
  tiposPath = "./dataCupom.json",
  locaisPath = "./dataLocalCaptura.json"
} = {}) {

  const { faker, rnd } = makeRNG(seed);
  const rng = rnd;

  const macro = loadJSON(macroPath);
  const catalog = loadJSON(catalogPath);
  const tipos = loadJSON(tiposPath).tipo_cupom;
  const locais = loadJSON(locaisPath).locais;

  const macros = Object.keys(macro);
  const out = [];

  while (out.length < count) {
    const macroNome = pickOne(macros, rng);
    const distritos = macro[macroNome].distritos;

    const distr = pickOne(distritos, rng);
    const bairro = distr.nome;

    const cep = randomCep(distr.cep_inicio, distr.cep_fim, rng);

    const categorias = Object.keys(catalog);
    const categoria = pickOne(categorias, rng);
    const nome_estabelecimento = pickOne(catalog[categoria], rng);

    const tipo_cupom = pickOne(tipos, rng);

    const valor_compra = currencyBetween(faker, 15, 1200, 2);
    let valor_cupom = 0;
    if (tipo_cupom === "Desconto") {
      valor_cupom = Number((valor_compra * (0.05 + rng() * 0.35)).toFixed(2));
    } else if (tipo_cupom === "Cashback") {
      valor_cupom = Number((valor_compra * (0.02 + rng() * 0.18)).toFixed(2));
    } else {
      valor_cupom = Number((valor_compra * (0.03 + rng() * 0.22)).toFixed(2))
    }

    const repasse_picmoney = estimateRepasse(valor_cupom, valor_compra);
    const produto = inferProduto(categoria, tipo_cupom);
    const local_captura = pickOne(locais, rng);

    const data = randomDateInRange(year, 5, 11, rng);
    const { hour, minute } = randomHourByCategory(categoria, rng);
    const data_captura = fmtBR(data);
    const hora = fmtHM(hour, minute);

    const id_cupom = uuid12(faker);
    const id_campanha = `CAMP-${categoria.toUpperCase().replace(/\W+/g,'_').slice(0,12)}`;

    out.push({
      data_captura,
      hora,
      nome_estabelecimento,
      categoria_estabelecimento: categoria,
      bairro_estabelecimento: bairro,
      id_campanha,
      id_cupom,
      tipo_cupom,
      produto,
      valor_cupom,
      valor_compra,
      repasse_picmoney,
      local_captura,
      cep,
      zona: macroNome
    });

    const extra = perHourMin + Math.floor(rng() * Math.max(1, (perHourMax - perHourMin + 1))) - 1;
    for (let i = 0; i < extra && out.length < count; i++) {
      const minute2 = Math.min(59, Math.floor(rng() * 60));
      out.push({
        ...out[out.length-1],
        id_cupom: uuid12(faker),
        hora: fmtHM(hour, minute2)
      });
    }
  }

  return out.slice(0, count);
}

module.exports = { generateBatch }
