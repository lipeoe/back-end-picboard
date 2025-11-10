const picboardDB = require('../db/db')


const TABLES = {
  unificada: {
    name: 'picmoney_unificada',
    dateColumn: 'data_captura',
    columns: [
      'hora',
      'valor_cupom',
      'valor_compra',
      'repasse_picmoney',
      'data_captura',
      'id_cupom',
      'tipo_cupom',
      'produto',
      'local_captura',
      'latitude',
      'longitude',
      'cep',
      'zona',
      'nome_estabelecimento',
      'categoria_estabelecimento',
      'bairro_estabelecimento',
      'id_campanha'
    ]
  },
  players: {
    name: 'picmoney_players',
    dateColumn: 'data_cadastro',
    columns: [
      'tempo_online',
      'idade',
      'ultima_sessao',
      'id_usuario',
      'data_cadastro',
      'bairro_trabalho',
      'cidade_escola',
      'data_nascimento',
      'pegou_cupom',
      'categoria_frequentada',
      'zona',
      'bairro_escola',
      'sexo',
      'cidade_residencial',
      'bairro_residencial',
      'cidade_trabalho'
    ],

    filterableDateColumns: ['data_cadastro', 'ultima_sessao']
  }
}


function buildSelectSQL({ tableKey, range, dateColumn }) {
  const { name, columns } = TABLES[tableKey];
  const cols = columns.map(c => `"${c}"`).join(', ')

  if (range.type === 'all_time') {
    return {
      sql: `SELECT ${cols} FROM ${name} ORDER BY "${dateColumn}" ASC NULLS LAST`,
      params: []
    }
  }

  return {
    sql: `SELECT ${cols} FROM ${name}
          WHERE "${dateColumn}" BETWEEN $1 AND $2
          ORDER BY "${dateColumn}" ASC NULLS LAST`,
    params: [range.from, range.to]
  }
}

async function fetchDataForExport({ table, range, filterBy }) {
  const tableKey = table
  const meta = TABLES[tableKey];

  if (!meta) throw new Error('Tabela inválida.')

  let dateColumn = meta.dateColumn
  if (tableKey === 'players' && filterBy && meta.filterableDateColumns.includes(filterBy)) {
    dateColumn = filterBy
  }

  const { sql, params } = buildSelectSQL({ tableKey, range, dateColumn })

  const { rows } = await picboardDB.query(sql, params)
  return { rows, columns: meta.columns, dateColumn }
}

module.exports = { fetchDataForExport }
