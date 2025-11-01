const express = require('express');
const { login } = require('../middleware/userLogin');
const router = express.Router();

router.post('/login', login);

module.exports = router;
