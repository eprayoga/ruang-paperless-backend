const fs = require("fs");
const fsPromise = require("fs/promises");
const path = require("path");
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const PDFParser = require('pdf-parse');
const qrcode = require("qrcode");
const config = require("../../../config");
const pool = require("../../../db");
const { signWithRSA, verifyWithRSA } = require("../../helper/rsa");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const Mailgen = require("mailgen");

dotenv.config();

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
                qrcode.toFile(qrCodePath, `${process.env.FRONTEND_URL}/document-verify/${document_id}`, {
                    errorCorrectionLevel: "H"
                }, async (err) => {
                    if (err) throw err;
                    const pages = pdfDoc.getPages();
                    const firstPage = pages[pages.length - 1];

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
            const { status } = req.query;

            if (status) {
                console.log(status)
                if (status === "signed") {
                    pool.query("SELECT * FROM documents WHERE created_by=$1 AND status='signed'", [user.user_id], (error, results) => {
                        if (error) throw error;
        
                        res.status(200).json({
                            data: results.rows
                        });
                    });
                } else if(status === "draft") {
                    pool.query("SELECT * FROM documents WHERE created_by=$1 AND status='not-signed'", [user.user_id], (error, results) => {
                        if (error) throw error;
        
                        res.status(200).json({
                            data: results.rows
                        });
                    });
                } else {
                    res.status(404).json({
                        message: "Data tidak ditemukan"
                    });
                }
            } else {
                pool.query("SELECT * FROM documents WHERE created_by=$1 AND status<>'deleted'", [user.user_id], (error, results) => {
                    if (error) throw error;
    
                    res.status(200).json({
                        data: results.rows
                    })
                });
            }

        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    getDocumentDetail: (req, res) => {
        try {
            const { id } = req.params;
            
            pool.query("SELECT document_id, documents.created_by, document_name, signed_by, document_path, documents.created_at, fullname, email FROM documents INNER JOIN users ON documents.created_by=users.user_id WHERE document_id=$1 AND documents.status<>'deleted'", [id], (error, results) => {
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
        try {
            const { id } = req.params;
            const user = req.user;

            // Generate RSA key pair
            const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: "pkcs1",
                    format: "pem",
                },
                privateKeyEncoding: {
                    type: "pkcs1",
                    format: "pem",
                },
            });

            const privateKeyPath = `private-${id}.pem`;
            const publicKeyPath = `public-${id}.pem`;

            fs.writeFileSync(`public/uploads/key/${privateKeyPath}`, privateKey);
            fs.writeFileSync(`public/uploads/key/${publicKeyPath}`, publicKey);

            pool.query("SELECT document_path, document_id FROM documents WHERE document_id=$1 AND created_by=$2", [id, user.user_id], async (error, results) => {
                if (error) throw error;

                if (results.rows.length) {
                    const doc = results.rows[0];

                    let target_path = path.resolve(
                        config.rootPath,
                        `public/uploads/document/draft-${doc.document_path}`
                    );

                    const fileData = fs.readFileSync(target_path);
        
                    // Simpan tanda tangan digital bersama dengan file PDF
                    const pdfDoc = await PDFDocument.load(fileData);
                    const pdfData = await PDFParser(fileData);

                    // Tandatangani data PDF menggunakan kunci privat
                    const signature = signWithRSA(privateKey, pdfData.text);
                
                    pdfDoc.setSubject(signature);
                    const signedPdfBytesTemp = await pdfDoc.save();

                    const draftPdf = path.resolve(`public/uploads/document/draft-${doc.document_path}`);

                    fs.unlinkSync(draftPdf);

                    fs.writeFileSync(`public/uploads/document/signed-${doc.document_path}`, signedPdfBytesTemp);

                    pool.query("UPDATE documents SET status='signed', signed_by=$1, update_at=CURRENT_DATE, update_by=$1 WHERE document_id=$2 AND created_by=$1", [user.user_id, id], (error, results) => {
                        if (error) throw error;
                        
                        pool.query("INSERT INTO keys (document_id, public_key, private_key, created_by, update_by) VALUES ($1, $2, $3, $4, $4)", [doc.document_id, publicKeyPath, privateKeyPath, user.user_id], (error, results) => {
                            if (error) throw error;

                            res.status(201).json({
                                message: "Berhasil menanda tangani dokumen.",
                            });
                        });

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
        }
    },

    documentVerifiy: (req, res) => {
        try {
            const { id } = req.params;

            pool.query("SELECT document_path, document_id FROM documents WHERE document_id=$1", [id], async (error, results) => {
                if (error) throw error;

                if (results.rows.length) {
                    if (req.file) {
                        const tmp_path = req.file.path;

                        const fileData = fs.readFileSync(tmp_path);
    
                        const pdfDoc = await PDFDocument.load(fileData);
                        const pdfData = await PDFParser(fileData);
    
                        const signature = pdfDoc.getSubject();

                        if (signature) {
                            pool.query("SELECT public_key FROM keys WHERE document_id=$1", [id], (error, results) => {
                                if (error) throw error;
    
                                const public_key_path = results.rows[0].public_key;
                                const publicKey_target_path = path.resolve(
                                    config.rootPath,
                                    `public/uploads/key/${public_key_path}`
                                );
            
                                const publicKey = fs.readFileSync(publicKey_target_path);
            
                                const isSignatureValid = verifyWithRSA(publicKey, pdfData.text, signature);
            
                                if (isSignatureValid) {
                                    res.status(200).json({
                                        message: "Tanda tangan digital pada file PDF VALID"
                                    })
                                } else {
                                    res.status(404).json({
                                        message: "Tanda tangan digital pada file PDF TIDAK VALID"
                                    })
                                }
                            })
                        } else {
                            res.status(404).json({
                                message: "Dokumen belum terdapat tanda tangan!"
                            })
                        }
                    } else {
                        res.status(404).json({
                            message: "Dokumen perlu di upload!",
                        })
                    }


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
        }
    },

    documentDelete: (req, res) => {
        try {
            const { id } = req.params;
            const user = req.user;
            
            pool.query("UPDATE documents SET status='deleted', delete_at=CURRENT_DATE, delete_by=$2 WHERE document_id=$1 AND created_by=$2", [id, user.user_id], (error, results) => {
                if (error) throw error;

                res.status(201).json({
                    message: "Sukses menghapus dokumen",
                })
            })
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });   
        }
    },

    documentSend: async (req, res) => {
        try {
            const user = req.user;
            const { id } = req.params;
            const { email, note } = req.body;

            // Send to Email
            // let configUser = {
            //     service: 'gmail',
            //     auth: {
            //         user: process.env.EMAIL,
            //         pass: process.env.PASSWORD,
            //     }
            // }

            // let transporter = nodemailer.createTransport(configUser);

            let MailGenerator = new Mailgen({
                theme: "default",
                product : {
                    name: "Ruang-Paperless",
                    link : 'https://ruang-paperless.com'
                }
            })
            let testAccount = await nodemailer.createTestAccount();

            // create reusable transporter object using the default SMTP transport
          let transporter = nodemailer.createTransport({
              host: "smtp.ethereal.email",
              port: 587,
              secure: false, // true for 465, false for other ports
              auth: {
                  user: testAccount.user, // generated ethereal user
                  pass: testAccount.pass, // generated ethereal password
              },
          });
        
            // Email body
            let response = {
                product: {
                    logo: 'https://lh3.googleusercontent.com/drive-viewer/AITFw-yHxDSt40zK3K3hbahDR59__6QYn0P36jE0OJy0QVZRMMPsVNsxcKhD5Hny79_N4wRZAA1glueYlJ6wab2Jl6Qy-C-b=s1600',
                    logoHeight: '30px'
                },
                body: {
                    name : email,
                    intro: "Kami ingin memberitahukan bahwa ini adalah dokumen yang kirimkan kepada Anda melalui web ruang-paperless. Berikut adalah deskripsi dari dokumen:",
                    dictionary: {
                        "ID User ruang-paperless": user.user_id,
                        "Email Pengirim": user.email,
                        "Nama Dokumen": "Nama Dokumen",
                        "Catatan": note,
                    },
                    action: [
                        {
                            instructions: "Untuk mengunduh dokumen tersebut, silahkan klik tombol dibawah.",
                            button: {
                                color: '#4F709C',
                                text: 'Unduh Sekarang',
                                link: ''
                            }
                        },
                        {
                            button: {
                                color: '#29A71A',
                                text: 'Cek Validasi Dokumen',
                                link: ''
                            }
                        },
                    ],
                    signature: 'Hormat Kami',
                }
            }
        
            let mail = MailGenerator.generate(response)

            let message = {
                from: process.env.EMAIL,
                to: email,
                subject: "Daftar Akun Berhasil, Silahkan Lihat Password", 
                html: mail, 
            }

            transporter.sendMail(message).then((info) => {
                return res.status(201)
                .json({ 
                    msg: "you should receive an email",
                    info : info.messageId,
                    preview: nodemailer.getTestMessageUrl(info)
                })
            }).catch(error => {
                return res.status(500).json({ error });
            })

        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    }
};
