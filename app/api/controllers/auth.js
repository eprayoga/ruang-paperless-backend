const nodemailer = require("nodemailer");
const Mailgen = require("mailgen");
const bcrypt = require("bcrypt");
const pool = require("../../../db");
const config = require("../../../config");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

// For Hashing Password
const salt = 10;

module.exports = {
    register: async (req, res, next) => {
        try {
            const { nik, fullname, email, birth_date, phone_number } = req.body;

            pool.query("SELECT s FROM users s WHERE s.nik = $1", [nik], (error, results) => {
                if (error) throw error;
                if (results.rows.length) {
                    return res.status(422).json({
                        message: "NIK sudah digunakan sebelumnya!"
                    })
                } else {
                    pool.query("SELECT s FROM users s WHERE s.email = $1", [email], async (error, results) => {
                        if (error) throw error;
                        if (results.rows.length) {
                            return res.status(422).json({
                                message: "Email yang digunakan sudah terdaftar!"
                            })
                        } else {
                            // Generate user_id
                            let getUser;
                            do { 
                                charset =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                                user_id = fullname.charAt(0);
                                for (var i = 0, n = charset.length; i < 8; ++i) {
                                    user_id += charset.charAt(Math.floor(Math.random() * n));
                                };
                                
                                getUser = await pool.query("SELECT s FROM users s WHERE s.user_id = $1", [user_id])
                            } while (getUser.length);
        
                            // Generate random password
                            var length = 15;
                            charset =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
                            password = "";
                            for (var i = 0, n = charset.length; i < length; ++i) {
                                password += charset.charAt(Math.floor(Math.random() * n));
                            };

                            // Generate random pin_id
                            var length = 16;
                            charset =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
                            pin_id = "";
                            for (var i = 0, n = charset.length; i < length; ++i) {
                                pin_id += charset.charAt(Math.floor(Math.random() * n));
                            };

                            // Generate random pin
                            var length = 6;
                            charset =  "0123456789";
                            pin = "";
                            for (var i = 0, n = charset.length; i < length; ++i) {
                                pin += charset.charAt(Math.floor(Math.random() * n));
                            };
        
                            // Send to Email
                            let configUser = {
                                service: 'gmail',
                                auth: {
                                    user: process.env.EMAIL,
                                    pass: process.env.PASSWORD,
                                }
                            }

                            let transporter = nodemailer.createTransport(configUser);
        
                            let MailGenerator = new Mailgen({
                                theme: "default",
                                product : {
                                    name: "Ruang-Paperless",
                                    link : 'https://mailgen.js/'
                                }
                            })
                        
                            // Email body
                            let response = {
                                product: {
                                    logo: 'https://lh3.googleusercontent.com/drive-viewer/AITFw-yHxDSt40zK3K3hbahDR59__6QYn0P36jE0OJy0QVZRMMPsVNsxcKhD5Hny79_N4wRZAA1glueYlJ6wab2Jl6Qy-C-b=s1600',
                                    logoHeight: '30px'
                                },
                                body: {
                                    name : fullname,
                                    intro: "Daftar akun Ruang-Paperless mu telah berhasil, silahkan SignIn dengan password dibawah ini dan gunakan PIN dibawah untuk proses Tanda Tangan Dokumen :",
                                    dictionary: {
                                        Password: password,
                                        PIN: pin,
                                    },
                                    action: {
                                        instructions: "Klik tombol dibawah untuk melanjutkan ke proses SignIn.",
                                        button: {
                                            color: '#4F709C',
                                            text: 'Login Sekarang',
                                            link: 'https://mailgen.js/confirm?s=d9729feb74992cc3482b350163a1a010'
                                        }
                                    },
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
        
                            // Password Encrypted
                            bcrypt.hash(password, salt, async (err, hash) => {
                                if (err) throw error;

                                pool.query("INSERT INTO users (user_id, nik, fullname, email, birth_date, phone_number, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *", [user_id, nik, fullname, email, birth_date, phone_number, hash], (error, results) => {
                                    if (error) throw error;

                                    pool.query("INSERT INTO pins (pin_id, pin, user_id, created_by) VALUES ($1, $2, $3, $4)", [pin_id, pin, user_id, user_id], (error, results) => {
                                        if (err) throw error;

                                        transporter.sendMail(message).then((info) => {
                                            return res.status(201)
                                            .json({ 
                                                msg: "you should receive an email",
                                            })
                                        }).catch(error => {
                                            return res.status(500).json({ error });
                                        })
                                    });
                                });
                            })
                        }
                    });
                }
            })  
        } catch (err) {
            if (err && err.name === "ValidationError") {
                return res.status(422).json({
                  error: 1,
                  message: err.message, 
                  fields: err.errors,
                });
            };
            next(err);
        };
    },

    signIn: (req, res) => {
        try {
            const {email, password} = req.body;
    
            pool.query("SELECT * FROM users WHERE email = $1", [email], async (error, results) => {
                if (error) throw error;
                if (results.rows.length) {
                    const user = results.rows[0];

                    bcrypt.compare(password, user.password, (error, response) => {
                        if (error) throw error;
                        if (response) {
                            const token = jwt.sign(
                                {
                                    user: {
                                        user_id: user.user_id,
                                        nik: user.nik,
                                        fullname: user.fullname,
                                        email: user.email,
                                        birth_date: user.birth_date,
                                        phone_number: user.phone_number,
                                        quota: user.quota,
                                    }
                                },
                                config.jwtKey
                            );

                            pool.query("UPDATE users SET last_signin=CURRENT_DATE, status='verified' WHERE user_id=$1", [user.user_id], (error, results) => {
                                if (error) throw error;

                                res.status(200).json({
                                    data: {
                                        token
                                    }
                                })
                            })

                        } else {
                            res.status(403).json({
                                message: "Password yang anda masukkan salah!",
                            })
                        }
                    })
                } else {
                    res.status(403).json({
                        message: "email yang anda masukkan belum terdaftar.",
                    });
                }
            });
        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    },

    pinValidation: (req, res) => {
        try {
            const user = req.user;
            const { pin } = req.body;

            pool.query("SELECT * FROM pins WHERE user_id=$1 AND pin=$2", [user.user_id, pin], (error, results) => {
                if (error) throw error;

                if (results.rows.length) {
                    res.status(200).json({
                        message: "PIN Valid",
                    })
                } else {
                    res.status(404).json({
                        message: "PIN Tidak Valid",
                    })
                }
            });

        } catch (error) {
            res.status(500).json({
                message: error.message || `Internal server error!`,
            });
        }
    }
}