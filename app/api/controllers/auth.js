const nodemailer = require('nodemailer');
const Mailgen = require('mailgen');
const bcrypt = require("bcrypt");

// For Hashing Password
const salt = 10;

module.exports = {
    register: async (req, res, next) => {
        try {
            var payload = req.body;
            
            // Generate random password
            var length = 15;
            charset =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
            passwordGenerate = "";
            for (var i = 0, n = charset.length; i < length; ++i) {
                passwordGenerate += charset.charAt(Math.floor(Math.random() * n));
            };
    
            // Add password to payload data
            payload = {
                ...payload,
                password: passwordGenerate
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
                    name : payload.name,
                    intro: "Daftar akun Ruang-Paperless mu telah berhasil, silahkan SignIn dengan password dibawah ini :",
                    dictionary: {
                        Password: payload.password,
                    },
                    action: {
                        instructions: "Klik tombol dibawah untuk melanjutkan ke proses SignIn.",
                        button: {
                            color: '#48cfad',
                            text: 'Login Sekarang',
                            link: 'https://mailgen.js/confirm?s=d9729feb74992cc3482b350163a1a010'
                        }
                    }
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
            bcrypt.hash(payload.password, salt, (err, hash) => {
                if (err) {
                    console.log(err);
                }

                transporter.sendMail(message).then((info) => {
                    return res.status(201)
                    .json({ 
                        msg: "you should receive an email",
                        info : info.messageId,
                        preview: nodemailer.getTestMessageUrl(info),
                    })
                }).catch(error => {
                    return res.status(500).json({ error })
                })

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
        const {email, password} = req.body;

        res.status(200).json({
            data: {
                email,
                password
            }
        })
    },
}