const express = require('express');
const router = express.Router();
const os = require("os");
const multer = require("multer");
const { uploadDocument, getDocumentDetail, getAllUserDocument, documentSign, documentDelete, documentSend, documentVerify } = require("../controllers/document");
const { isLoginUser } = require("../../middleware/auth")

router.get('/', isLoginUser, getAllUserDocument);
router.post('/upload', isLoginUser, multer({ dest: os.tmpdir() }).single("document"), uploadDocument);
router.post('/sign/:id', isLoginUser, documentSign);
router.get('/detail/:id', getDocumentDetail);
router.post('/verify/:id', multer({ dest: os.tmpdir() }).single("document"), documentVerify);
router.delete('/delete/:id', isLoginUser, documentDelete);
router.post('/send/:id', isLoginUser, documentSend);

module.exports = router;
