const Pool = require("pg");

const pool = new Pool({
    user: "postgres",
    password: "yoga95",
    host: "localhost",
    port: "5432",
    database: "ruang_paperless",
});

module.exports = pool;