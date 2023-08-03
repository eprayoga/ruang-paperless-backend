const express = require('express');
const router = express.Router();
const os = require("os");
const multer = require("multer");
const { uploadDocument, documentDetail } = require("../controllers/document");
const { isLoginUser } = require("../../middleware/auth")

router.post('/upload', isLoginUser, multer({ dest: os.tmpdir() }).single("document"), uploadDocument);
router.get('/detail/:id', isLoginUser, documentDetail);

module.exports = router;
