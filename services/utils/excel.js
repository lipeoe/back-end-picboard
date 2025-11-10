const ExcelJS = require('exceljs')

/**
 * @param {object} payload
 * @param {string} payload.sheetName
 * @param {string[]} payload.columns
 * @param {Array<object>} payload.rows
 * @param {object} payload.meta  
 * @returns 
 */
async function buildExcelBuffer({ sheetName, columns, rows, meta }) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.title = `Export ${sheetName}`
  wb.properties.subject = `Export ${sheetName}`
  wb.properties.company = 'PicMoney'


  if (meta) {
    const info = wb.addWorksheet('README');
    info.addRow(['Tabela', String(meta.table || '')])
    info.addRow(['Coluna de data', String(meta.dateColumn || '')])
    if (meta.range) {
      info.addRow(['Tipo de range', String(meta.range.type)])
      if (meta.range.type === 'window') {
        info.addRow(['From', String(meta.range.from)])
        info.addRow(['To', String(meta.range.to)])
      }
    }
  }

  const ws = wb.addWorksheet(sheetName)

 
  ws.addRow(columns)


  for (const row of rows) {
    const line = columns.map(c => row[c] ?? null)
    ws.addRow(line)
  }


  ws.columns.forEach((col) => {
    let max = 10
    col.eachCell({ includeEmpty: true }, cell => {
      const val = cell.value == null ? '' : String(cell.value)
      max = Math.max(max, val.length + 2)
    })
    col.width = Math.min(max, 60)
  })


  const buffer = await wb.xlsx.writeBuffer()
  return buffer
}

module.exports = { buildExcelBuffer }
