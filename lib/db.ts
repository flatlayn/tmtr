import mysql, { PoolOptions } from 'mysql2';

const pool0 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N0_PORT)
} satisfies PoolOptions);

const pool1 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N1_PORT)
} satisfies PoolOptions);

const pool2 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N2_PORT)
} satisfies PoolOptions);

module.exports = {
    pool0,
    pool1,
    pool2
};