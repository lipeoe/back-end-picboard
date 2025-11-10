const express = require('express')
const router = express.Router()
const { exportExcelController } = require('../controllers/exportController.js')

router.get('/export/excel', exportExcelController)

module.exports = router
