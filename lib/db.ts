import mysql, { Pool, PoolOptions, RowDataPacket } from 'mysql2/promise';

// Create connection pools for all 3 nodes
const pool0 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N0_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,  // 20 seconds
    acquireTimeout: 20000
} as PoolOptions);

const pool1 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N1_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,
    acquireTimeout: 20000
} as PoolOptions);

const pool2 = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_user,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    port: Number(process.env.N2_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,
    acquireTimeout: 20000
} as PoolOptions);

// Helper to get pool by node ID
export function getPool(nodeId: number): Pool {
    switch (nodeId) {
        case 0: return pool0;
        case 1: return pool1;
        case 2: return pool2;
        default: throw new Error(`Invalid node ID: ${nodeId}`);
    }
}

// Export all pools
export { pool0, pool1, pool2 };

// Health check function
export async function checkNodeHealth(nodeId: number): Promise<boolean> {
    try {
        const pool = getPool(nodeId);
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error(`Node ${nodeId} health check failed:`, error);
        return false;
    }
}

// Get all pools as an array
export const pools = [pool0, pool1, pool2];