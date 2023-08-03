const express = require('express');
const router = express.Router();
const os = require("os");
const multer = require("multer");
const { uploadDocument, getDocumentDetail, getAllUserDocument, documentSign, documentVerifiy } = require("../controllers/document");
const { isLoginUser } = require("../../middleware/auth")

router.get('/', isLoginUser, getAllUserDocument);
router.post('/upload', isLoginUser, multer({ dest: os.tmpdir() }).single("document"), uploadDocument);
router.post('/sign/:id', isLoginUser, documentSign);
router.get('/detail/:id', isLoginUser, getDocumentDetail);
router.post('/verify/:id', multer({ dest: os.tmpdir() }).single("document"), documentVerifiy);

module.exports = router;
