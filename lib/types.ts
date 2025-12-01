// Transaction type based on the trans table from finance dataset
// account_id, trans_date are optional since they're not used in the actual database
export interface Transaction {
    trans_id: number;
    account_id?: number;
    trans_date?: string;
    type?: string;
    operation: string;
    amount: number;
    balance: number;
}

// For creating new transactions (without trans_id)
export type CreateTransactionInput = Omit<Transaction, 'trans_id'>;

// For updating transactions
export type UpdateTransactionInput = Partial<Omit<Transaction, 'trans_id'>>;

// Node status
export interface NodeStatus {
    nodeId: number;
    isHealthy: boolean;
    lastChecked: Date;
}

// Replication log entry
export interface ReplicationLog {
    log_id?: number;
    source_node: number;
    target_node: number;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    trans_id: number;
    transaction_data: string; // JSON string
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    created_at?: Date;
    completed_at?: Date;
    error_message?: string;
}

// API Response types
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    nodeId?: number;
}

// Isolation levels
export type IsolationLevel = 
    | 'READ UNCOMMITTED'
    | 'READ COMMITTED'
    | 'REPEATABLE READ'
    | 'SERIALIZABLE';
