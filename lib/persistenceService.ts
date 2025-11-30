// @/lib/persistenceService.ts

import { getTransactionService } from './transactionService';
import { CreateTransactionInput, UpdateTransactionInput, Transaction } from './types';

// Define the structure of the data we queue
interface QueuePayload {
    transId: number;
    targetNodeId: number;
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    // For INSERT, this is the full transaction; for UPDATE, just the update fields.
    data?: CreateTransactionInput | UpdateTransactionInput | Transaction;
}

export class PersistenceService {

    /**
     * Enqueues a failed replication operation into the Node 0 database.
     */
    static async enqueue(operation: QueuePayload): Promise<void> {
        // We use Node 0's service to access the central queue table
        const node0Service = getTransactionService(0);

        try {
            // Convert the operation data (transaction or updates) into a JSON string
            const payloadString = operation.data ? JSON.stringify(operation.data) : null;

            await node0Service.executeQuery(
                `INSERT INTO replication_queue 
                 (target_node_id, operation_type, trans_id, payload, status)
                 VALUES (?, ?, ?, ?, 'PENDING')`,
                [
                    operation.targetNodeId,
                    operation.type,
                    operation.transId,
                    payloadString
                ]
            );
            console.log(`[QUEUE] Job enqueued for Node ${operation.targetNodeId}: ${operation.type} TransID ${operation.transId}`);
        } catch (error) {
            console.error('CRITICAL: Failed to enqueue replication job on Node 0!', error);
            // In a production system, this failure would trigger an alert.
        }
    }

    /**
     * Retrieves the oldest PENDING job from the queue.
     */
    static async getNextJob(): Promise<any | null> {
        const node0Service = getTransactionService(0);

        try {
            // 1. Find the oldest PENDING job and mark it as PROCESSING (to prevent concurrent workers taking it)
            // Note: SQL syntax for "SELECT...FOR UPDATE" or two separate queries is DB dependent.
            // Using a simple SELECT here for concept:
            const job = await node0Service.executeQuery(
                `SELECT * FROM replication_queue 
                 WHERE status = 'PENDING' 
                 ORDER BY created_at ASC 
                 LIMIT 1`
            );

            if (job && job.length > 0) {
                const jobData = job[0];

                // 2. Mark the job as PROCESSING
                await node0Service.executeQuery(
                    `UPDATE replication_queue SET status = 'PROCESSING', retries = retries + 1 WHERE id = ?`,
                    [jobData.id]
                );

                // Parse the payload back into an object
                jobData.payload = jobData.payload ? JSON.parse(jobData.payload) : null;
                return jobData;
            }
            return null;
        } catch (error) {
            console.error('Error fetching job from queue:', error);
            return null;
        }
    }

    // Add methods for marking jobs as 'COMPLETE' or 'FAILED' here...
    static async markJobComplete(jobId: number): Promise<void> {
        const node0Service = getTransactionService(0);
        await node0Service.executeQuery(
            `UPDATE replication_queue SET status = 'COMPLETE' WHERE id = ?`,
            [jobId]
        );
    }
}