import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './db';
import { Transaction, CreateTransactionInput, UpdateTransactionInput, IsolationLevel } from './types';

/**
 * Database service for handling transaction operations
 */
export class TransactionService {
    private pool: Pool;
    private nodeId: number;

    constructor(nodeId: number) {
        this.nodeId = nodeId;
        this.pool = getPool(nodeId);
    }

    /**
     * Set transaction isolation level for a connection
     */
    async setIsolationLevel(level: IsolationLevel): Promise<void> {
        await this.pool.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${level}`);
    }

    /**
     * Get all transactions from this node
     */
    async getAllTransactions(limit: number = 100): Promise<Transaction[]> {
        const [rows] = await this.pool.query<RowDataPacket[]>(
            'SELECT * FROM trans LIMIT ?',
            [limit]
        );
        return rows as Transaction[];
    }

    /**
     * Get a single transaction by ID
     */
    async getTransactionById(transId: number): Promise<Transaction | null> {
        const [rows] = await this.pool.query<RowDataPacket[]>(
            'SELECT * FROM trans WHERE trans_id = ?',
            [transId]
        );
        return rows.length > 0 ? (rows[0] as Transaction) : null;
    }

    /**
     * Get transactions by account ID
     */
    async getTransactionsByAccount(accountId: number): Promise<Transaction[]> {
        const [rows] = await this.pool.query<RowDataPacket[]>(
            'SELECT * FROM trans WHERE account_id = ?',
            [accountId]
        );
        return rows as Transaction[];
    }

    /**
     * Create a new transaction
     */
    async createTransaction(data: CreateTransactionInput): Promise<number> {
        // Generate a unique trans_id since AUTO_INCREMENT may not be enabled
        const transId = Math.floor(Math.random() * 1000000) + 1000000;
        
        await this.pool.query(
            `INSERT INTO trans (trans_id, operation, amount, balance) 
             VALUES (?, ?, ?, ?)`,
            [transId, data.operation, data.amount, data.balance]
        );
        
        return transId;
    }

    /**
     * Update an existing transaction
     */
    async updateTransaction(transId: number, data: UpdateTransactionInput): Promise<boolean> {
        const fields: string[] = [];
        const values: any[] = [];

        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (fields.length === 0) return false;

        values.push(transId);
        const [result] = await this.pool.query<ResultSetHeader>(
            `UPDATE trans SET ${fields.join(', ')} WHERE trans_id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete a transaction
     */
    async deleteTransaction(transId: number): Promise<boolean> {
        const [result] = await this.pool.query<ResultSetHeader>(
            'DELETE FROM trans WHERE trans_id = ?',
            [transId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get transaction count
     */
    async getTransactionCount(): Promise<number> {
        const [rows] = await this.pool.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM trans'
        );
        return rows[0].count;
    }

    /**
     * Execute a raw query (for testing concurrent scenarios)
     */
    async executeQuery(query: string, params: any[] = []): Promise<any> {
        const [rows] = await this.pool.query(query, params);
        return rows;
    }

    /**
     * Begin a transaction
     */
    async beginTransaction(): Promise<void> {
        await this.pool.query('START TRANSACTION');
    }

    /**
     * Commit a transaction
     */
    async commit(): Promise<void> {
        await this.pool.query('COMMIT');
    }

    /**
     * Rollback a transaction
     */
    async rollback(): Promise<void> {
        await this.pool.query('ROLLBACK');
    }
}

/**
 * Helper function to get transaction service for a specific node
 */
export function getTransactionService(nodeId: number): TransactionService {
    return new TransactionService(nodeId);
}
