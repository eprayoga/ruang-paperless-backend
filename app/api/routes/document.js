const express = require('express');
const router = express.Router();
const os = require("os");
const multer = require("multer");
const { uploadDocument } = require("../controllers/document");
const { isLoginUser } = require("../../middleware/auth")

router.post('/upload', isLoginUser, multer({ dest: os.tmpdir() }).single("document"), uploadDocument);

module.exports = router;
