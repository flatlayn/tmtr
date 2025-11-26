import { getTransactionService } from './transactionService';
import { Transaction, CreateTransactionInput, UpdateTransactionInput } from './types';
import { checkNodeHealth } from './db';

/**
 * Replication Service
 * Handles data replication between nodes according to the distributed database strategy:
 * - Node 0 is the central node (contains all data)
 * - Node 1 and Node 2 are partitions (contain subsets of data)
 * - Updates on Node 1 or 2 must replicate to Node 0
 * - Updates on Node 0 must replicate to the appropriate partition (Node 1 or 2)
 */

export class ReplicationService {
    /**
     * Determine which partition node (1 or 2) should contain a transaction
     * This logic depends on your fragmentation criteria
     * TODO: Update this based on your actual fragmentation strategy
     */
    private static determinePartitionNode(transaction: Transaction | CreateTransactionInput): number {
        // Example fragmentation by account_id:
        // - Node 1: account_id with odd numbers
        // - Node 2: account_id with even numbers
        
        // TODO: Replace with your actual fragmentation criteria
        // (could be based on date, account_id range, transaction type, etc.)
        return transaction.account_id % 2 === 0 ? 2 : 1;
    }

    /**
     * Replicate INSERT operation
     * @param sourceNodeId - The node where the insert originated
     * @param transId - The ID of the newly inserted transaction
     * @param transaction - The transaction data
     */
    static async replicateInsert(
        sourceNodeId: number,
        transId: number,
        transaction: CreateTransactionInput
    ): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];
        const fullTransaction: Transaction = { ...transaction, trans_id: transId };

        try {
            if (sourceNodeId === 0) {
                // Central node → Replicate to appropriate partition node
                const targetNode = this.determinePartitionNode(fullTransaction);
                await this.replicateToNode(targetNode, 'INSERT', fullTransaction, errors);
            } else {
                // Partition node (1 or 2) → Replicate to central node (0)
                await this.replicateToNode(0, 'INSERT', fullTransaction, errors);
            }

            return { success: errors.length === 0, errors };
        } catch (error: any) {
            errors.push(`Replication failed: ${error.message}`);
            return { success: false, errors };
        }
    }

    /**
     * Replicate UPDATE operation
     */
    static async replicateUpdate(
        sourceNodeId: number,
        transId: number,
        updates: UpdateTransactionInput
    ): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            // First, get the full transaction from source node
            const sourceService = getTransactionService(sourceNodeId);
            const fullTransaction = await sourceService.getTransactionById(transId);

            if (!fullTransaction) {
                errors.push(`Transaction ${transId} not found on source node ${sourceNodeId}`);
                return { success: false, errors };
            }

            if (sourceNodeId === 0) {
                // Central node → Replicate to appropriate partition node
                const targetNode = this.determinePartitionNode(fullTransaction);
                await this.replicateToNode(targetNode, 'UPDATE', fullTransaction, errors, updates);
            } else {
                // Partition node → Replicate to central node
                await this.replicateToNode(0, 'UPDATE', fullTransaction, errors, updates);
            }

            return { success: errors.length === 0, errors };
        } catch (error: any) {
            errors.push(`Replication failed: ${error.message}`);
            return { success: false, errors };
        }
    }

    /**
     * Replicate DELETE operation
     */
    static async replicateDelete(
        sourceNodeId: number,
        transId: number
    ): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            // Before deleting, we need to know which partition node it belongs to
            // Get the transaction first
            const sourceService = getTransactionService(sourceNodeId);
            const transaction = await sourceService.getTransactionById(transId);

            if (!transaction) {
                // Transaction might already be deleted, still try to replicate
                console.warn(`Transaction ${transId} not found on source node ${sourceNodeId}`);
            }

            if (sourceNodeId === 0) {
                // Central node → Replicate to appropriate partition node
                if (transaction) {
                    const targetNode = this.determinePartitionNode(transaction);
                    await this.deleteFromNode(targetNode, transId, errors);
                }
            } else {
                // Partition node → Replicate to central node
                await this.deleteFromNode(0, transId, errors);
            }

            return { success: errors.length === 0, errors };
        } catch (error: any) {
            errors.push(`Replication failed: ${error.message}`);
            return { success: false, errors };
        }
    }

    /**
     * Helper: Replicate to a specific target node
     */
    private static async replicateToNode(
        targetNodeId: number,
        operation: 'INSERT' | 'UPDATE',
        transaction: Transaction,
        errors: string[],
        updates?: UpdateTransactionInput
    ): Promise<void> {
        // Check if target node is healthy
        const isHealthy = await checkNodeHealth(targetNodeId);
        if (!isHealthy) {
            errors.push(`Target node ${targetNodeId} is not healthy - replication queued for retry`);
            // TODO: Queue this for retry when node comes back online
            return;
        }

        const targetService = getTransactionService(targetNodeId);

        try {
            if (operation === 'INSERT') {
                // Check if transaction already exists (idempotency)
                const existing = await targetService.getTransactionById(transaction.trans_id);
                if (existing) {
                    console.log(`Transaction ${transaction.trans_id} already exists on node ${targetNodeId}, skipping`);
                    return;
                }

                // Insert the transaction with the same ID
                await targetService.executeQuery(
                    `INSERT INTO trans (trans_id, account_id, trans_date, trans_type, operation, amount, balance) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        transaction.trans_id,
                        transaction.account_id,
                        transaction.trans_date,
                        transaction.trans_type,
                        transaction.operation,
                        transaction.amount,
                        transaction.balance
                    ]
                );
            } else if (operation === 'UPDATE') {
                await targetService.updateTransaction(transaction.trans_id, updates || transaction);
            }
        } catch (error: any) {
            errors.push(`Failed to replicate to node ${targetNodeId}: ${error.message}`);
        }
    }

    /**
     * Helper: Delete from a specific target node
     */
    private static async deleteFromNode(
        targetNodeId: number,
        transId: number,
        errors: string[]
    ): Promise<void> {
        const isHealthy = await checkNodeHealth(targetNodeId);
        if (!isHealthy) {
            errors.push(`Target node ${targetNodeId} is not healthy - replication queued for retry`);
            // TODO: Queue this for retry
            return;
        }

        const targetService = getTransactionService(targetNodeId);

        try {
            await targetService.deleteTransaction(transId);
        } catch (error: any) {
            errors.push(`Failed to delete from node ${targetNodeId}: ${error.message}`);
        }
    }

    /**
     * Sync a node that came back online after failure
     * Compares central node with partition node and syncs missing transactions
     */
    static async syncNodeAfterRecovery(recoveredNodeId: number): Promise<{ 
        success: boolean; 
        synced: number; 
        errors: string[] 
    }> {
        const errors: string[] = [];
        let synced = 0;

        try {
            if (recoveredNodeId === 0) {
                // Central node recovered - sync from both partition nodes
                // This is complex and requires merging data from Node 1 and Node 2
                // TODO: Implement central node recovery
                errors.push('Central node recovery not yet implemented');
            } else {
                // Partition node recovered - sync from central node
                const centralService = getTransactionService(0);
                const partitionService = getTransactionService(recoveredNodeId);

                // Get all transactions from central node (in production, you'd paginate this)
                const allTransactions = await centralService.getAllTransactions(10000);

                for (const transaction of allTransactions) {
                    // Check if this transaction belongs to this partition
                    const targetNode = this.determinePartitionNode(transaction);
                    if (targetNode !== recoveredNodeId) continue;

                    // Check if it exists in the partition
                    const existing = await partitionService.getTransactionById(transaction.trans_id);
                    if (!existing) {
                        // Insert missing transaction
                        await partitionService.executeQuery(
                            `INSERT INTO trans (trans_id, account_id, trans_date, trans_type, operation, amount, balance) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [
                                transaction.trans_id,
                                transaction.account_id,
                                transaction.trans_date,
                                transaction.trans_type,
                                transaction.operation,
                                transaction.amount,
                                transaction.balance
                            ]
                        );
                        synced++;
                    }
                }
            }

            return { success: errors.length === 0, synced, errors };
        } catch (error: any) {
            errors.push(`Sync failed: ${error.message}`);
            return { success: false, synced, errors };
        }
    }
}
