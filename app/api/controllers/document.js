const fs = require("fs");
const fsPromise = require("fs/promises");
const path = require("path");
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const PDFParser = require('pdf-parse');
const qrcode = require("qrcode");
const config = require("../../../config");
const pool = require("../../../db");

module.exports = {
    uploadDocument: async (req, res) => {
        try {
            if (req.file) {
                const { document_name } = req.body;

                // Generate document_id
                const length = 16;
                charset =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
                let document_id = "";
                for (var i = 0, n = charset.length; i < length; ++i) {
                    document_id += charset.charAt(Math.floor(Math.random() * n));
                };

                let tmp_path = req.file.path;
                let originalNotExt = 
                req.file.originalname.split(".")[0];
                let originalExt =
                req.file.originalname.split(".")[
                    req.file.originalname.split(".").length - 1
                ];
                const currentdate = new Date(); 
                const datetime = currentdate.getHours() + ""
                                    + currentdate.getMinutes() + ""
                                    + currentdate.getMilliseconds() + ""
                                    + currentdate.getDate() + "" 
                                    + (currentdate.getMonth()+1) + "" 
                                    + currentdate.getFullYear();
                let filename = originalNotExt + "_" + datetime + "." + originalExt;

                let target_path = path.resolve(
                    config.rootPath,
                    `public/uploads/document/${filename}`
                );

                const src = fs.createReadStream(tmp_path);
                const dest = fs.createWriteStream(target_path);

                await src.pipe(dest);
                
                const fileData = fs.readFileSync(tmp_path);

                const pdfDoc = await PDFDocument.load(fileData);
                let qrCodePath = path.resolve(`public/images/qrcode-${originalNotExt}.png`);
                qrcode.toFile(qrCodePath, "Ini link qrcode", {
                    errorCorrectionLevel: "H"
                }, async (err) => {
                    if (err) throw err;
                    const pages = pdfDoc.getPages();
                    const firstPage = pages[0];

                    let img = fs.readFileSync(qrCodePath);

                    img = await pdfDoc.embedPng(img);

                    const { width } = firstPage.getSize();

                    firstPage.drawImage(img, {
                    x: width - 120,
                    y: 50,
                    width: 80,
                    height: 80,
                    });

                    fs.unlinkSync(qrCodePath);

                    const qrPdfBytesTemp = await pdfDoc.save();

                    let filename = 'draft-' + originalNotExt + "_" + datetime + "." + originalExt;

                    fs.writeFileSync(`public/uploads/document/${filename}`, qrPdfBytesTemp);
                });

                pool.query("INSERT INTO documents (document_id, document_name, document_path, created_by) VALUES ($1, $2, $3, $4)",
                    [document_id, document_name, filename, req.user.user_id], (error, results) => {
                        if (error) throw error;
                        res.status(201).json({
                            message: "Sukses menyimpan dokumen.",
                            data: {
                                document_id,
                            }
                        })
                    }
                );

            } else {
                res.status("404").json({
                    message: "Dokumen perlu di upload!",
                })
            };
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    getAllUserDocument: (req, res) => {
        try {
            const user = req.user;

            pool.query("SELECT * FROM documents WHERE created_by=$1", [user.user_id], (error, results) => {
                if (error) throw error;

                res.status(200).json({
                    data: results.rows
                })
            });
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    getDocumentDetail: (req, res) => {
        try {
            const { id } = req.params;

            pool.query("SELECT document_id, document_name, signed_by, document_path, documents.created_at, fullname, email FROM documents INNER JOIN users ON documents.created_by=users.user_id WHERE document_id=$1", [id], (error, results) => {
                if (error) throw error;
                if (results.rows.length) {
                    res.status(200).json({
                        message: "Dokumen ditemukan",
                        data: results.rows[0],
                    });
                } else {
                    res.status(404).json({
                        message: "Dokumen tidak ditemukan."
                    });
                };
            });
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        };
    },

    documentSign: (req, res) => {
        const { id } = req.params;

        res.status(201).json({
            message: "Tanda tangan dokument : " + id,
        });
    },
};
