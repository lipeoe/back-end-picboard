const express = require('express')
const { signup } = require('../middleware/userSignup')
const router = express.Router()

router.post('/cadastro', signup)

module.exports = router
