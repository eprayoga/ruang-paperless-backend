var express = require('express');
const { register, signIn } = require('../controllers/auth');
var router = express.Router();

router.post('/register',  register);
router.post('/signin',  signIn);

module.exports = router;
