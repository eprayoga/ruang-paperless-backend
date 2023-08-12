const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const PDFParser = require('pdf-parse');
const qrcode = require("qrcode");
const config = require("../../../config");
const { signWithRSA, verifyWithRSA } = require("../../helper/rsa");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const Mailgen = require("mailgen");
const { Op } = require('sequelize');
const Sequelize = require('sequelize');

const { User, Document, Key } = require("../../../models");

dotenv.config();

module.exports = {
    uploadDocument: async (req, res) => {
        try {
            if (req.file) {
                const { document_name } = req.body;
                const user = req.user;

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

                const data = {
                    document_id,
                    document_name,
                    document_path: filename,
                    created_by: user.user_id,
                    updated_by: user.user_id,
                }

                await Document.create(data);

                res.status(201).json({
                    message: "Sukses menyimpan dokumen.",
                    data: {
                        document_id,
                    }
                })

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

    getAllUserDocument: async (req, res) => {
        try {
            const user = req.user;
            const { status } = req.query;

            if (status) {
                console.log(status)
                if (status === "signed") {
                    const documents = await Document.findAll({
                        where: {
                            created_by: user.user_id,
                            status,
                        }
                    });
                    
                    res.status(200).json({
                        data: documents
                    });
                } else if(status === "draft") {
                    const documents = await Document.findAll({
                        where: {
                            created_by: user.user_id,
                            status: 'not-signed'
                        }
                    });

                    res.status(200).json({
                        data: documents
                    });

                } else {
                    res.status(404).json({
                        message: "Data tidak ditemukan"
                    });
                }
            } else {
                const documents = await Document.findAll({
                    where: {
                        created_by: user.user_id,
                        status: {
                            [Op.not]: 'deleted'
                        }
                    }
                });

                res.status(200).json({
                    data: documents
                });
            };
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    getDocumentDetail: async (req, res) => {
        try {
            const { id } = req.params;

            const document = await Document.findOne({
                attributes: ['document_id', 'created_by', 'document_name', 'signed_by', 'document_path', 'created_at'],
                where: {
                    document_id: id,
                    status: {
                        [Op.not]: 'deleted'
                    }
                },
                include: [
                    {
                        model: User,
                        as: "document_created_by",
                        attributes: ['fullname', 'email']
                    }
                ]
            });

            if (document !== null) {
                res.status(200).json({
                    message: "Dokumen ditemukan",
                    data: document,
                });
            } else {
                res.status(404).json({
                    message: "Dokumen tidak ditemukan."
                });
            }
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        };
    },

    documentSign: async (req, res) => {
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

            const document = await Document.findOne({
                attributes: ['document_path', 'document_id'],
                where: {
                    document_id: id,
                    created_by: user.user_id,
                }
            })

            if (document !== null) {

                const doc = document;
    
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

                await Document.update(
                    { status: 'signed', signed_by: user.user_id, updated_at: Sequelize.literal('CURRENT_DATE'), updated_by: user.user_id },
                    {
                        where: {
                            document_id: id,
                            created_by: user.user_id
                        },
                    }
                );

                await Key.create(
                    {
                        document_id: doc.document_id,
                        public_key: publicKeyPath,
                        private_key: privateKeyPath,
                        created_by: user.user_id,
                        updated_by: user.user_id
                    },
                );

                res.status(201).json({
                    message: "Berhasil menanda tangani dokumen.",
                });
    
            } else {
                res.status(404).json({
                    message: "Dokumen tidak ditemukan."
                });
            }

        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    documentVerify : async (req, res) => {
        try {
            const { id } = req.params;
    
            const document = await Document.findOne({
                attributes: ['document_id', 'document_path'],
                where: {
                    document_id: id
                }
            });
    
            if (document) {
                if (req.file) {
                    const tmp_path = req.file.path;
    
                    const fileData = fs.readFileSync(tmp_path);
                    const pdfDoc = await PDFDocument.load(fileData);
                    const pdfData = await PDFParser(fileData);
    
                    const signature = pdfDoc.getSubject();
    
                    if (signature) {
                        const key = await Key.findOne({
                            attributes: ['public_key'],
                            where: {
                                document_id: id
                            }
                        });
    
                        if (key) {
                            const public_key_path = key.public_key;
                            const publicKey_target_path = path.resolve(
                                config.rootPath,
                                `public/uploads/key/${public_key_path}`
                            );
    
                            const publicKey = fs.readFileSync(publicKey_target_path);
    
                            const isSignatureValid = verifyWithRSA(publicKey, pdfData.text, signature);
    
                            if (isSignatureValid) {
                                res.status(200).json({
                                    message: "Tanda tangan digital pada file PDF VALID"
                                });
                            } else {
                                res.status(404).json({
                                    message: "Tanda tangan digital pada file PDF TIDAK VALID"
                                });
                            }
                        } else {
                            res.status(404).json({ 
                                message: "Kunci publik tidak ditemukan untuk dokumen ini."
                            });
                        }
                    } else {
                        res.status(404).json({
                            message: "Dokumen belum terdapat tanda tangan!"
                        });
                    }
                } else {
                    res.status(404).json({
                        message: "Dokumen perlu di upload!"
                    });
                }
            } else {
                res.status(404).json({
                    message: "Dokumen tidak ditemukan."
                });
            }
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`
            });
        }
    },

    documentDelete: async (req, res) => {
        try {
            const { id } = req.params;
            const user = req.user;

            const updatedDocument = await Document.update(
                {
                    status: 'deleted',
                    deleted_at: new Date(),
                    deleted_by: user.user_id,
                },
                {
                    where: {
                        document_id: id,
                        created_by: user.user_id,
                    },
                }
            );

            if (updatedDocument[0] > 0) {
                res.status(201).json({
                    message: "Sukses menghapus dokumen",
                });
            } else {
                res.status(404).json({
                    message: "Dokumen tidak ditemukan atau tidak memiliki izin untuk dihapus",
                });
            }
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
