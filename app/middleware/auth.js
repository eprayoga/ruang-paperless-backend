const config = require("../../config");
const jwt = require('jsonwebtoken')
const pool = require("../../db");


module.exports = {
    isLoginUser: (req, res, next) => {
        try {
            const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;

            const data = jwt.verify(token, config.jwtKey);

            pool.query("SELECT * FROM users WHERE user_id = $1", [data.user.user_id], (error, results) => {
                if (error) throw error;
                if (results.rows.length) {
                    req.user = results.rows[0];
                    req.token = token;
                    next();
                } else {
                    throw new Error();
                }
            });
        } catch (error) {
            res.status(401).json({
                error: 'Not authorized to access this resources',
            })
        }
    },
}