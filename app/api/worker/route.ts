// app/api/worker/route.ts
import { NextResponse } from 'next/server';
import { PersistenceService } from '@/lib/persistenceService';
import { getTransactionService } from '@/lib/transactionService';
import {checkNodeHealth} from "@/lib/db";

// Note: You must reuse your existing ReplicationService helpers for the actual DB operations.
// For simplicity, we define the execution logic directly here.

const executeJob = async (job: any): Promise<boolean> => {
    const targetService = getTransactionService(job.target_node_id);
    const targetIsHealthy = await checkNodeHealth(job.target_node_id);

    if (!targetIsHealthy) {
        console.log(`Node ${job.target_node_id} is still down. Skipping retry.`);
        return false; // Did not succeed
    }

    try {
        if (job.operation_type === 'INSERT') {
            const transaction = job.payload;
            // Execute the INSERT logic (handle idempotency)
            // This mirrors the logic from your replicateToNode helper
            await targetService.executeQuery(
                `INSERT INTO trans (trans_id, account_id, trans_date, trans_type, operation, amount, balance) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [/* ... values from transaction ... */]
            );
        } else if (job.operation_type === 'UPDATE') {
            const updates = job.payload;
            await targetService.updateTransaction(job.trans_id, updates);
        } else if (job.operation_type === 'DELETE') {
            await targetService.deleteTransaction(job.trans_id);
        }

        return true; // Success
    } catch (error) {
        // Log the error but return false to keep the job in the queue (or mark as FAILED)
        console.error(`Error executing job ${job.id} on node ${job.target_node_id}:`, error);
        // In a real system, you might mark it as FAILED after max retries.
        return false;
    }
};

/**
 * Worker endpoint: Executes a batch of pending replication jobs.
 */
export async function GET() {
    // 1. Fetch a batch of jobs (e.g., limit to 10 jobs per execution)
    // NOTE: You'll need to update PersistenceService.getNextJob to fetch a batch and mark them 'PROCESSING'.
    // For this example, we'll fetch just one job.
    const job = await PersistenceService.getNextJob();

    if (!job) {
        return NextResponse.json({ success: true, message: 'Queue is empty.' });
    }

    console.log(`Processing Job ${job.id} for Node ${job.target_node_id} (${job.operation_type})`);

    // 2. Execute the job
    const success = await executeJob(job);

    // 3. Update job status
    if (success) {
        await PersistenceService.markJobComplete(job.id);
        console.log(`Job ${job.id} completed successfully.`);
    } else {
        // If execution failed, mark status back to 'PENDING' or 'FAILED'
        // to allow it to be picked up again, or permanently fail after X retries.
        // For simplicity, we just leave it marked as 'PROCESSING' for now, requiring a proper state update in production.
    }

    return NextResponse.json({
        success: true,
        jobsProcessed: 1,
        jobStatus: success ? 'COMPLETE' : 'RETRY_NEEDED'
    });
}