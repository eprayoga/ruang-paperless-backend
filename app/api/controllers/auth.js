const nodemailer = require("nodemailer");
const Mailgen = require("mailgen");
const bcrypt = require("bcrypt");
const pool = require("../../../db/index");

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
                        message: "NIK already exist!"
                    })
                } else {
                    pool.query("SELECT s FROM users s WHERE s.email = $1", [email], async (error, results) => {
                        if (error) throw error;
                        if (results.rows.length) {
                            return res.status(422).json({
                                message: "Email already exist!"
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
        
                            // Send to Email
                            let testAccount = await nodemailer.createTestAccount();
        
                            let transporter = nodemailer.createTransport({
                                host: "smtp.ethereal.email",
                                port: 587,
                                secure: false,
                                auth: {
                                    user: testAccount.user, 
                                    pass: testAccount.pass, 
                                },
                            });
        
                            let MailGenerator = new Mailgen({
                                theme: "default",
                                product : {
                                    name: "Ruang-Paperless",
                                    link : 'https://mailgen.js/'
                                }
                            })
                        
                            // Email body
                            let response = {
                                body: {
                                    name : fullname,
                                    intro: "Daftar akun Ruang-Paperless mu telah berhasil, silahkan SignIn dengan password dibawah ini :",
                                    dictionary: {
                                        Password: password,
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
                                from: '"Fred Foo 👻" <foo@example.com>',
                                to: "bar@example.com, baz@example.com",
                                subject: "Daftar Akun Berhasil, Silahkan Lihat Password", 
                                html: mail, 
                            }
        
                            // Password Encrypted
                            bcrypt.hash(password, salt, async (err, hash) => {
                                if (err) {
                                    console.log(err);
                                }
        
                                pool.query("INSERT INTO users (user_id, nik, fullname, email, birth_date, phone_number, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *", [user_id, nik, fullname, email, birth_date, phone_number, hash], (error, results) => {
                                    if (error) throw error;
        
                                    transporter.sendMail(message).then((info) => {
                                        return res.status(201)
                                        .json({ 
                                            msg: "you should receive an email",
                                            info : info.messageId,
                                            preview: nodemailer.getTestMessageUrl(info),
                                            user: results.rows[0],
                                        })
                                    }).catch(error => {
                                        return res.status(500).json({ error })
                                    })
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

    signIn: (req, res, next) => {
        // const {email, password} = req.body;

        // res.status(200).json({
        //     data: {
        //         email,
        //         password
        //     }
        // })

        pool.query("SELECT * FROM users", (error, result) => {
            if (error) throw error;
            res.status(200).json({
                data: result.rows,
            })
        })
    },
}