import { NextRequest, NextResponse } from 'next/server';
import { getTransactionService } from '@/lib/transactionService';
import { ApiResponse } from '@/lib/types';

/**
 * POST /api/concurrency/test
 * Run concurrency tests with different isolation levels
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { testCase, isolationLevel, transId, numTransactions = 5 } = body;

        if (!testCase || !isolationLevel || !transId) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'testCase, isolationLevel, and transId are required' },
                { status: 400 }
            );
        }

        const startTime = Date.now();
        let successCount = 0;
        let failureCount = 0;
        const conflicts: string[] = [];

        // Run the appropriate test case
        switch (testCase) {
            case 1:
                // Case 1: Concurrent reads
                const readResults = await testConcurrentReads(transId, isolationLevel, numTransactions);
                successCount = readResults.success;
                failureCount = readResults.failures;
                conflicts.push(...readResults.conflicts);
                break;

            case 2:
                // Case 2: One write, multiple reads
                const mixedResults = await testReadWrite(transId, isolationLevel, numTransactions);
                successCount = mixedResults.success;
                failureCount = mixedResults.failures;
                conflicts.push(...mixedResults.conflicts);
                break;

            case 3:
                // Case 3: Concurrent writes
                const writeResults = await testConcurrentWrites(transId, isolationLevel, numTransactions);
                successCount = writeResults.success;
                failureCount = writeResults.failures;
                conflicts.push(...writeResults.conflicts);
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
                testCase,
                isolationLevel,
                duration,
                successCount,
                failureCount,
                conflicts,
                totalTransactions: numTransactions
            }
        });

    } catch (error: any) {
        console.error('POST /api/concurrency/test error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * Test Case 1: Concurrent reads on the same transaction
 */
async function testConcurrentReads(
    transId: number,
    isolationLevel: string,
    numTransactions: number
): Promise<{ success: number; failures: number; conflicts: string[] }> {
    const promises = [];
    const conflicts: string[] = [];

    // Create multiple concurrent read operations across different nodes
    for (let i = 0; i < numTransactions; i++) {
        const nodeId = i % 3; // Distribute across all 3 nodes
        promises.push(
            (async () => {
                try {
                    const service = getTransactionService(nodeId);
                    await service.setIsolationLevel(isolationLevel as any);
                    const transaction = await service.getTransactionById(transId);
                    return { success: true, transaction };
                } catch (error: any) {
                    conflicts.push(`Node ${nodeId}: ${error.message}`);
                    return { success: false, error: error.message };
                }
            })()
        );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return { success: successCount, failures: failureCount, conflicts };
}

/**
 * Test Case 2: One write operation with concurrent reads
 */
async function testReadWrite(
    transId: number,
    isolationLevel: string,
    numTransactions: number
): Promise<{ success: number; failures: number; conflicts: string[] }> {
    const promises = [];
    const conflicts: string[] = [];

    // First operation: UPDATE on Node 0
    promises.push(
        (async () => {
            try {
                const service = getTransactionService(0);
                await service.setIsolationLevel(isolationLevel as any);
                
                // Small delay to allow reads to start first
                await new Promise(resolve => setTimeout(resolve, 10));
                
                const success = await service.updateTransaction(transId, {
                    amount: Math.random() * 1000
                });
                return { success, type: 'WRITE' };
            } catch (error: any) {
                conflicts.push(`Write operation: ${error.message}`);
                return { success: false, error: error.message };
            }
        })()
    );

    // Remaining operations: READS on different nodes
    for (let i = 1; i < numTransactions; i++) {
        const nodeId = i % 3;
        promises.push(
            (async () => {
                try {
                    const service = getTransactionService(nodeId);
                    await service.setIsolationLevel(isolationLevel as any);
                    const transaction = await service.getTransactionById(transId);
                    return { success: true, type: 'READ', transaction };
                } catch (error: any) {
                    conflicts.push(`Read on Node ${nodeId}: ${error.message}`);
                    return { success: false, error: error.message };
                }
            })()
        );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return { success: successCount, failures: failureCount, conflicts };
}

/**
 * Test Case 3: Concurrent write operations on the same transaction
 */
async function testConcurrentWrites(
    transId: number,
    isolationLevel: string,
    numTransactions: number
): Promise<{ success: number; failures: number; conflicts: string[] }> {
    const promises = [];
    const conflicts: string[] = [];

    // Create multiple concurrent write operations across different nodes
    for (let i = 0; i < numTransactions; i++) {
        const nodeId = i % 3;
        promises.push(
            (async () => {
                try {
                    const service = getTransactionService(nodeId);
                    await service.setIsolationLevel(isolationLevel as any);
                    
                    // Each transaction tries to update the amount
                    const newAmount = 1000 + (i * 100);
                    const success = await service.updateTransaction(transId, {
                        amount: newAmount
                    });
                    
                    return { success, nodeId, amount: newAmount };
                } catch (error: any) {
                    if (error.message.includes('Deadlock') || error.message.includes('Lock wait timeout')) {
                        conflicts.push(`Deadlock on Node ${nodeId}`);
                    } else {
                        conflicts.push(`Node ${nodeId}: ${error.message}`);
                    }
                    return { success: false, error: error.message };
                }
            })()
        );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return { success: successCount, failures: failureCount, conflicts };
}
