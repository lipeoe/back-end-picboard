const { buildDateRange } = require('../services/dateRange')
const { fetchDataForExport } = require('../services/exportService')
const { buildExcelBuffer } = require('../services/utils/excel')

function badRequest(res, msg) {
  return res.status(400).json({ error: msg })
}


async function exportExcelController(req, res) {
  try {
    const {
      table = 'unificada',
      preset,
      from,
      to,
      filterBy,
    } = req.query || {}


    const normTable = String(table).toLowerCase()
    if (!['unificada', 'players'].includes(normTable)) {
      return badRequest(res, "Parâmetro 'table' deve ser 'unificada' ou 'players'.")
    }


    const range = buildDateRange({ preset, from, to })


    let normFilterBy = null;
    if (normTable === 'players') {
      normFilterBy = (filterBy || 'data_cadastro').toString().toLowerCase()
      if (!['data_cadastro', 'ultima_sessao'].includes(normFilterBy)) {
        return badRequest(res, "Parâmetro 'filterBy' (players) deve ser 'data_cadastro' ou 'ultima_sessao'.")
      }
    }

    const { rows, columns, dateColumn } = await fetchDataForExport({
      table: normTable,
      range,
      filterBy: normFilterBy
    })

    const fileBaseName = `export_${normTable}_${range.type === 'all_time' ? 'all' : `${range.from}_a_${range.to}`}`
    const buffer = await buildExcelBuffer({
      sheetName: `${normTable}`,
      columns,
      rows,
      meta: {
        table: normTable,
        dateColumn,
        range
      }
    })


    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileBaseName}.xlsx"`)
    return res.status(200).send(buffer)
  } catch (err) {
    console.error('Erro em /export/excel:', err)
    return res.status(500).json({ error: 'Falha ao gerar Excel.' })
  }
}

module.exports = { exportExcelController }
