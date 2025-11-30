import { NextRequest, NextResponse } from 'next/server';
import { getTransactionService } from '@/lib/transactionService';
import { ReplicationService } from '@/lib/replicationService';
import { PersistenceService } from '@/lib/persistenceService';
import { checkNodeHealth } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

/**
 * POST /api/recovery/test
 * Run recovery test cases
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { testCase, targetNodeId, transId, simulatedFailures = [] } = body;

        if (!testCase || targetNodeId === undefined) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'testCase and targetNodeId are required' },
                { status: 400 }
            );
        }

        const startTime = Date.now();
        let result: any;

        switch (testCase) {
            case 1:
                // Case 1: Partition → Central failure
                result = await testPartitionToCentralFailure(targetNodeId, transId, simulatedFailures);
                break;

            case 2:
                // Case 2: Central node recovery
                result = await testCentralNodeRecovery();
                break;

            case 3:
                // Case 3: Central → Partition failure
                result = await testCentralToPartitionFailure(targetNodeId, transId, simulatedFailures);
                break;

            case 4:
                // Case 4: Partition node recovery
                result = await testPartitionNodeRecovery(targetNodeId);
                break;

            default:
                return NextResponse.json<ApiResponse>(
                    { success: false, error: `Invalid test case: ${testCase}` },
                    { status: 400 }
                );
        }

        const duration = Date.now() - startTime;

        return NextResponse.json<ApiResponse>({
            success: true,
            data: {
                ...result,
                duration
            }
        });

    } catch (error: any) {
        console.error('POST /api/recovery/test error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * Case 1: Write from partition fails to replicate to central node
 */
async function testPartitionToCentralFailure(
    sourceNodeId: number,
    transId: number | undefined,
    simulatedFailures: number[]
): Promise<any> {
    const isCentralOffline = simulatedFailures.includes(0);

    try {
        // Create transaction on partition node
        const service = getTransactionService(sourceNodeId);
        
        let actualTransId: number;
        let transaction: any;

        if (transId) {
            // Update existing transaction
            await service.updateTransaction(transId, {
                amount: Math.random() * 1000
            });
            actualTransId = transId;
            transaction = await service.getTransactionById(actualTransId);
        } else {
            // Generate random trans_id since AUTO_INCREMENT may not be set
            actualTransId = Math.floor(Math.random() * 1000000) + 2000000;
            
            // Insert directly with trans_id
            await service.executeQuery(
                `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                [actualTransId, 'TEST_RECOVERY_CASE1', 100, 1000]
            );
            
            transaction = await service.getTransactionById(actualTransId);
        }

        if (!transaction) {
            return {
                success: false,
                details: `Transaction ${actualTransId} not found after creation`
            };
        }

        // If central is simulated offline, manually queue the operation
        if (isCentralOffline) {
            console.log(`[Case 1] Central offline, queueing operation for trans_id ${actualTransId}`);
            console.log(`[Case 1] Transaction data:`, transaction);
            
            try {
                // Create a placeholder transaction on Node 0 first to satisfy foreign key
                // This represents the "metadata" of what needs to be replicated
                const node0Service = getTransactionService(0);
                try {
                    await node0Service.executeQuery(
                        `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                        [actualTransId, 'PENDING_REPLICATION', 0, 0]
                    );
                    console.log(`[Case 1] Created placeholder transaction on Node 0`);
                } catch (e: any) {
                    // If it already exists, that's fine
                    if (!e.message.includes('Duplicate entry')) {
                        throw e;
                    }
                }
                
                await PersistenceService.enqueue({
                    transId: actualTransId,
                    targetNodeId: 0,
                    type: 'INSERT',
                    data: transaction
                });
                
                console.log(`[Case 1] Successfully enqueued`);
                
                // Verify it was enqueued
                const allJobs = await PersistenceService.getAllJobs();
                console.log(`[Case 1] Queue now has ${allJobs.length} jobs`);

                return {
                    success: true,
                    queuedOperations: 1,
                    recoveredOperations: 0,
                    details: `Operation queued - central node offline (simulated). Queue has ${allJobs.length} jobs.`
                };
            } catch (error: any) {
                console.error(`[Case 1] Failed to enqueue:`, error);
                return {
                    success: false,
                    queuedOperations: 0,
                    recoveredOperations: 0,
                    details: `Failed to queue: ${error.message}`
                };
            }
        }

        // Central is online, replicate normally
        const replicationResult = await ReplicationService.replicateInsert(
            sourceNodeId,
            actualTransId,
            transaction
        );

        const queued = replicationResult.errors.some(e => e.includes('queued'));

        return {
            success: true,
            queuedOperations: queued ? 1 : 0,
            recoveredOperations: 0,
            details: queued 
                ? 'Operation queued - central node offline'
                : `Replicated successfully to central node`
        };

    } catch (error: any) {
        return {
            success: false,
            queuedOperations: 0,
            recoveredOperations: 0,
            details: error.message
        };
    }
}

/**
 * Case 2: Central node recovers and syncs from partitions
 */
async function testCentralNodeRecovery(): Promise<any> {
    try {
        // Check if central node is healthy
        const isHealthy = await checkNodeHealth(0);
        
        if (!isHealthy) {
            return {
                success: false,
                details: 'Central node is offline - cannot test recovery'
            };
        }

        // Check queue status first
        const allJobs = await PersistenceService.getAllJobs();
        console.log(`[Case 2] Queue status:`, allJobs);
        
        // Process queued operations
        const job = await PersistenceService.getNextJob();
        console.log(`[Case 2] Retrieved job:`, job);
        
        if (!job) {
            return {
                success: true,
                queuedOperations: 0,
                recoveredOperations: 0,
                details: `No queued operations to process. Queue has ${allJobs.length} total jobs.`
            };
        }

        // Execute the queued job
        const targetService = getTransactionService(job.target_node_id);
        
        try {
            if (job.operation_type === 'INSERT') {
                const transaction = job.payload;
                
                // Check if already exists
                const existing = await targetService.getTransactionById(transaction.trans_id);
                if (existing) {
                    // If it's a placeholder (PENDING_REPLICATION), update it with real data
                    if (existing.operation === 'PENDING_REPLICATION') {
                        console.log(`Updating placeholder for trans_id ${transaction.trans_id}`);
                        await targetService.executeQuery(
                            `UPDATE trans SET operation = ?, amount = ?, balance = ? WHERE trans_id = ?`,
                            [transaction.operation, transaction.amount, transaction.balance, transaction.trans_id]
                        );
                        await PersistenceService.markJobComplete(job.id);
                        return {
                            success: true,
                            queuedOperations: 1,
                            recoveredOperations: 1,
                            details: `Processed queued ${job.operation_type} for trans_id ${transaction.trans_id} (updated placeholder)`
                        };
                    }
                    
                    // Already has real data, skip
                    console.log(`Transaction ${transaction.trans_id} already exists with real data, skipping`);
                    await PersistenceService.markJobComplete(job.id);
                    return {
                        success: true,
                        queuedOperations: 1,
                        recoveredOperations: 1,
                        details: 'Processed queued operation (already existed)'
                    };
                }

                // Insert the transaction (doesn't exist at all)
                await targetService.executeQuery(
                    `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                    [transaction.trans_id, transaction.operation, transaction.amount, transaction.balance]
                );
                
                await PersistenceService.markJobComplete(job.id);
                
                return {
                    success: true,
                    queuedOperations: 1,
                    recoveredOperations: 1,
                    details: `Processed queued ${job.operation_type} for trans_id ${transaction.trans_id} to Node ${job.target_node_id}`
                };
                
            } else if (job.operation_type === 'UPDATE') {
                const transId = job.payload.trans_id || job.trans_id;
                await targetService.updateTransaction(transId, job.payload);
                await PersistenceService.markJobComplete(job.id);
                
                return {
                    success: true,
                    queuedOperations: 1,
                    recoveredOperations: 1,
                    details: `Processed queued UPDATE for trans_id ${transId}`
                };
                
            } else if (job.operation_type === 'DELETE') {
                const transId = job.payload.trans_id || job.trans_id;
                await targetService.deleteTransaction(transId);
                await PersistenceService.markJobComplete(job.id);
                
                return {
                    success: true,
                    queuedOperations: 1,
                    recoveredOperations: 1,
                    details: `Processed queued DELETE for trans_id ${transId}`
                };
            }

            return {
                success: false,
                queuedOperations: 1,
                recoveredOperations: 0,
                details: `Unknown operation type: ${job.operation_type}`
            };

        } catch (error: any) {
            console.error('Failed to process queued job:', error);
            return {
                success: false,
                queuedOperations: 1,
                recoveredOperations: 0,
                details: `Failed to process queue: ${error.message}`
            };
        }

    } catch (error: any) {
        return {
            success: false,
            queuedOperations: 0,
            recoveredOperations: 0,
            details: error.message
        };
    }
}

/**
 * Case 3: Write from central fails to replicate to partition
 */
async function testCentralToPartitionFailure(
    targetNodeId: number,
    transId: number | undefined,
    simulatedFailures: number[]
): Promise<any> {
    const isPartitionOffline = simulatedFailures.includes(targetNodeId);

    try {
        // Create or update transaction on central node
        const service = getTransactionService(0);
        
        let actualTransId: number;
        let transaction: any;

        if (transId) {
            await service.updateTransaction(transId, {
                amount: Math.random() * 1000
            });
            actualTransId = transId;
            transaction = await service.getTransactionById(actualTransId);
        } else {
            // Generate random trans_id since AUTO_INCREMENT may not be set
            actualTransId = Math.floor(Math.random() * 1000000) + 3000000;
            
            // Insert directly with trans_id
            await service.executeQuery(
                `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                [actualTransId, 'TEST_RECOVERY_CASE3', 50, 950]
            );
            
            transaction = await service.getTransactionById(actualTransId);
        }

        if (!transaction) {
            return {
                success: false,
                details: `Transaction ${actualTransId} not found after creation`
            };
        }

        // If partition is simulated offline, manually queue the operation
        if (isPartitionOffline) {
            console.log(`[Case 3] Node ${targetNodeId} offline, queueing operation for trans_id ${actualTransId}`);
            
            try {
                // Create placeholder on target partition node first to satisfy foreign key
                const targetService = getTransactionService(targetNodeId);
                
                // Check if transaction already exists on target
                const existing = await targetService.getTransactionById(actualTransId);
                if (!existing) {
                    await targetService.executeQuery(
                        `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                        [actualTransId, 'PENDING_REPLICATION', 0, 0]
                    );
                    console.log(`[Case 3] Created placeholder transaction on Node ${targetNodeId}`);
                } else {
                    console.log(`[Case 3] Transaction already exists on Node ${targetNodeId}, using existing`);
                }
                
                await PersistenceService.enqueue({
                    transId: actualTransId,
                    targetNodeId: targetNodeId,
                    type: 'INSERT',
                    data: transaction
                });

                console.log(`[Case 3] Successfully enqueued`);
                
                return {
                    success: true,
                    queuedOperations: 1,
                    recoveredOperations: 0,
                    details: `Operation queued - Node ${targetNodeId} offline (simulated)`
                };
            } catch (error: any) {
                console.error(`[Case 3] Failed to enqueue:`, error);
                return {
                    success: false,
                    queuedOperations: 0,
                    recoveredOperations: 0,
                    details: `Failed to queue: ${error.message}`
                };
            }
        }

        // Partition is online, replicate normally
        const replicationResult = await ReplicationService.replicateInsert(
            0,
            actualTransId,
            transaction
        );

        const queued = replicationResult.errors.some(e => e.includes('queued'));

        return {
            success: true,
            queuedOperations: queued ? 1 : 0,
            recoveredOperations: 0,
            details: queued
                ? `Operation queued - Node ${targetNodeId} offline`
                : `Replicated successfully to Node ${targetNodeId}`
        };

    } catch (error: any) {
        return {
            success: false,
            queuedOperations: 0,
            recoveredOperations: 0,
            details: error.message
        };
    }
}

/**
 * Case 4: Partition node recovers and syncs from central
 */
async function testPartitionNodeRecovery(nodeId: number): Promise<any> {
    try {
        // Check if partition node is healthy
        const isHealthy = await checkNodeHealth(nodeId);
        
        if (!isHealthy) {
            return {
                success: false,
                details: `Node ${nodeId} is offline - cannot test recovery`
            };
        }

        let queueProcessed = 0;
        let queueFailed = 0;
        const targetService = getTransactionService(nodeId);

        // First, process any queued operations for this specific node
        const allJobs = await PersistenceService.getAllJobs();
        const nodeJobs = allJobs.filter(job => 
            job.target_node_id === nodeId && job.status === 'PENDING'
        );

        console.log(`[Case 4] Found ${nodeJobs.length} queued jobs for Node ${nodeId}`);

        for (const jobData of nodeJobs) {
            try {
                // Mark as processing
                const node0Service = getTransactionService(0);
                await node0Service.executeQuery(
                    `UPDATE replication_queue SET status = 'PROCESSING' WHERE id = ?`,
                    [jobData.id]
                );

                const job = {
                    ...jobData,
                    payload: jobData.payload ? JSON.parse(jobData.payload) : null
                };

                if (job.operation_type === 'INSERT') {
                    const transaction = job.payload;
                    
                    // Check if already exists
                    const existing = await targetService.getTransactionById(transaction.trans_id);
                    if (!existing) {
                        // Insert the transaction
                        await targetService.executeQuery(
                            `INSERT INTO trans (trans_id, operation, amount, balance) VALUES (?, ?, ?, ?)`,
                            [transaction.trans_id, transaction.operation, transaction.amount, transaction.balance]
                        );
                    }
                    
                    await PersistenceService.markJobComplete(job.id);
                    queueProcessed++;
                } else if (job.operation_type === 'UPDATE') {
                    const transId = job.payload.trans_id || job.trans_id;
                    await targetService.updateTransaction(transId, job.payload);
                    await PersistenceService.markJobComplete(job.id);
                    queueProcessed++;
                } else if (job.operation_type === 'DELETE') {
                    const transId = job.payload.trans_id || job.trans_id;
                    await targetService.deleteTransaction(transId);
                    await PersistenceService.markJobComplete(job.id);
                    queueProcessed++;
                }
            } catch (error: any) {
                console.error(`Failed to process job ${jobData.id}:`, error);
                queueFailed++;
            }
        }

        // Then, sync missed transactions from central node (checks last 100 transactions)
        const syncResult = await ReplicationService.syncNodeAfterRecovery(nodeId);

        const totalRecovered = queueProcessed + syncResult.synced;
        const details = [];
        
        if (queueProcessed > 0) {
            details.push(`Processed ${queueProcessed} queued operations`);
        }
        if (syncResult.synced > 0) {
            details.push(`Synced ${syncResult.synced} transactions from bulk sync`);
        }
        if (queueFailed > 0) {
            details.push(`${queueFailed} operations failed`);
        }
        if (totalRecovered === 0) {
            details.push('No missing transactions found');
        }

        return {
            success: syncResult.success && queueFailed === 0,
            queuedOperations: nodeJobs.length,
            recoveredOperations: totalRecovered,
            details: details.join(', ')
        };

    } catch (error: any) {
        return {
            success: false,
            queuedOperations: 0,
            recoveredOperations: 0,
            details: error.message
        };
    }
}
