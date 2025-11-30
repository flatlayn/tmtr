import { getTransactionService } from './transactionService';
import { Transaction, CreateTransactionInput, UpdateTransactionInput } from './types';
import { checkNodeHealth } from './db';
import { PersistenceService } from './persistenceService';

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
     * based on the parity of the transId.
     */
    private static determinePartitionNode(transId: number): number {
        // Node 1: Odd trans_id
        // Node 2: Even trans_id
        return transId % 2 === 0 ? 2 : 1;
    }

    /**
     * Replicate INSERT operation
     */
    static async replicateInsert(
        sourceNodeId: number,
        transId: number,
        transaction: CreateTransactionInput
    ): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];
        // The transaction must be passed with its assigned trans_id
        const fullTransaction: Transaction = { ...transaction, trans_id: transId };

        try {
            if (sourceNodeId === 0) {
                // Central node → Replicate to appropriate partition node based on transId
                const targetNode = this.determinePartitionNode(transId); // FIX 1: Use transId
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
            // First, get the full transaction from source node (needed for payload and existence check)
            const sourceService = getTransactionService(sourceNodeId);
            const fullTransaction = await sourceService.getTransactionById(transId);

            if (!fullTransaction) {
                errors.push(`Transaction ${transId} not found on source node ${sourceNodeId}`);
                return { success: false, errors };
            }

            if (sourceNodeId === 0) {
                // Central node → Replicate to appropriate partition node
                const targetNode = this.determinePartitionNode(transId); // FIX 1: Use transId
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
    ): Promise<{ success: boolean; errors: string[]; queued: number }> {
        const errors: string[] = [];
        let queuedCount = 0;

        const targetNodes: number[] = [];
        if (sourceNodeId === 0 ){
            // Central node deletes -> replicate to the partition node responsible for this ID
            targetNodes.push(this.determinePartitionNode(transId));
        } else {
            // Partition node deletes -> replicate only to the central node (0)
            targetNodes.push(0);
        }

        for (const targetNodeId of targetNodes) {
            const result = await this.deleteFromNode(targetNodeId, transId, errors)
            if (result.queued) {
                queuedCount++;
            }
        }

        return { success: errors.length === 0, errors, queued: queuedCount };
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
    ): Promise<{ replicated: boolean }> { // Return result status
        const isHealthy = await checkNodeHealth(targetNodeId);

        if (!isHealthy) {
            PersistenceService.enqueue({
                transId: transaction.trans_id,
                targetNodeId,
                type: operation,
                data: operation === 'INSERT' ? transaction : updates
            });
            errors.push(`Target node ${targetNodeId} is not healthy - replication queued for retry`);
            return { replicated: false };
        }

        const targetService = getTransactionService(targetNodeId);

        try {
            if (operation === 'INSERT') {
                const existing = await targetService.getTransactionById(transaction.trans_id);
                if (existing) {
                    console.log(`Transaction ${transaction.trans_id} already exists on node ${targetNodeId}, skipping`);
                    return { replicated: true }; // Already exists, considered successful
                }

                await targetService.executeQuery(
                    `INSERT INTO trans (trans_id, operation, amount, balance)
                     VALUES (?, ?, ?, ?)`,
                    [
                        transaction.trans_id,
                        transaction.operation,
                        transaction.amount,
                        transaction.balance
                    ]
                );
            } else if (operation === 'UPDATE') {
                await targetService.updateTransaction(transaction.trans_id, updates || transaction);
            }
            return { replicated: true };
        } catch (error: any) {
            // Unexpected DB error (connection dropped, bad query) - queue for safety
            PersistenceService.enqueue({
                transId: transaction.trans_id,
                targetNodeId,
                type: operation,
                data: operation === 'INSERT' ? transaction : updates
            });
            errors.push(`Failed to replicate to node ${targetNodeId} due to DB error: ${error.message} - operation queued`);
            return { replicated: false };
        }
    }

    /**
     * Helper: Delete from a specific target node
     */
    private static async deleteFromNode(
        targetNodeId: number,
        transId: number,
        errors: string[]
    ): Promise<{ deleted: boolean, queued: boolean }> {
        const isHealthy = await checkNodeHealth(targetNodeId);

        if (!isHealthy) {
            PersistenceService.enqueue({
                transId,
                targetNodeId,
                type: 'DELETE',
            });
            errors.push(`Target node ${targetNodeId} is not healthy - DELETE queued for retry`);
            return { deleted: false, queued: true };
        }

        const targetService = getTransactionService(targetNodeId);

        try {
            await targetService.deleteTransaction(transId);
            return { deleted: true, queued: false };
        } catch (error: any) {
            // Unexpected DB error - queue for safety
            PersistenceService.enqueue({
                transId,
                targetNodeId,
                type: 'DELETE',
            });
            errors.push(`Failed to delete from node ${targetNodeId}: ${error.message} - operation queued`);
            return { deleted: false, queued: true };
        }
    }

    /**
     * Sync a node that came back online after failure
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
                errors.push('Central node recovery not yet implemented (requires merging)');
            } else {
                // Partition node recovered - sync recent transactions only (last 100)
                const centralService = getTransactionService(0);
                const recoveredService = getTransactionService(recoveredNodeId);
                
                // Get recent transactions from central (last 100, ordered by trans_id DESC)
                const recentTransactions = await centralService.executeQuery(
                    'SELECT * FROM trans ORDER BY trans_id DESC LIMIT 100'
                );

                for (const transaction of recentTransactions) {
                    // Check if this transaction belongs to this partition
                    const targetNode = this.determinePartitionNode(transaction.trans_id);
                    if (targetNode !== recoveredNodeId) continue;

                    // Check if transaction already exists on recovered node
                    const existing = await recoveredService.getTransactionById(transaction.trans_id);
                    if (existing) continue; // Already has it, skip

                    // Insert missing transaction
                    const result = await this.replicateToNode(recoveredNodeId, 'INSERT', transaction, errors);
                    if (result.replicated) {
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