import { NextRequest, NextResponse } from 'next/server';
import { getTransactionService } from '@/lib/transactionService';
import { ReplicationService } from '@/lib/replicationService';
import { ApiResponse } from '@/lib/types';

/**
 * GET /api/transactions
 * Get all transactions from all nodes or a specific node
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const nodeId = searchParams.get('nodeId');
        const limit = parseInt(searchParams.get('limit') || '100');
        const transId = searchParams.get('transId');
        const accountId = searchParams.get('accountId');

        // If specific node requested
        if (nodeId !== null) {
            const node = parseInt(nodeId);
            const service = getTransactionService(node);

            // Get specific transaction
            if (transId) {
                const transaction = await service.getTransactionById(parseInt(transId));
                return NextResponse.json<ApiResponse>({
                    success: true,
                    data: transaction,
                    nodeId: node
                });
            }

            // Get transactions by account
            if (accountId) {
                const transactions = await service.getTransactionsByAccount(parseInt(accountId));
                return NextResponse.json<ApiResponse>({
                    success: true,
                    data: { [`node${node}`]: transactions },
                    nodeId: node
                });
            }

            // Get all transactions from this node
            const transactions = await service.getAllTransactions(limit);
            return NextResponse.json<ApiResponse>({
                success: true,
                data: { [`node${node}`]: transactions },
                nodeId: node
            });
        }

        // Get transactions from all nodes
        const allTransactions = await Promise.all([
            getTransactionService(0).getAllTransactions(limit),
            getTransactionService(1).getAllTransactions(limit),
            getTransactionService(2).getAllTransactions(limit),
        ]);

        return NextResponse.json<ApiResponse>({
            success: true,
            data: {
                node0: allTransactions[0],
                node1: allTransactions[1],
                node2: allTransactions[2]
            }
        });

    } catch (error: any) {
        console.error('GET /api/transactions error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * POST /api/transactions
 * Create a new transaction
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { nodeId, transaction } = body;

        if (nodeId === undefined) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'nodeId is required' },
                { status: 400 }
            );
        }

        const service = getTransactionService(nodeId);
        const transId = await service.createTransaction(transaction);

        // Trigger replication to other nodes
        const replicationResult = await ReplicationService.replicateInsert(nodeId, transId, transaction);
        
        return NextResponse.json<ApiResponse>({
            success: true,
            data: { 
                trans_id: transId,
                replication: replicationResult
            },
            nodeId
        });

    } catch (error: any) {
        console.error('POST /api/transactions error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/transactions
 * Update an existing transaction
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { nodeId, transId, updates } = body;

        if (nodeId === undefined || !transId) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'nodeId and transId are required' },
                { status: 400 }
            );
        }

        const service = getTransactionService(nodeId);
        const success = await service.updateTransaction(transId, updates);

        if (!success) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'Transaction not found or no changes made' },
                { status: 404 }
            );
        }

        // Trigger replication to other nodes
        const replicationResult = await ReplicationService.replicateUpdate(nodeId, transId, updates);

        return NextResponse.json<ApiResponse>({
            success: true,
            data: { 
                trans_id: transId,
                replication: replicationResult
            },
            nodeId
        });

    } catch (error: any) {
        console.error('PUT /api/transactions error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/transactions
 * Delete a transaction
 */
export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const nodeId = searchParams.get('nodeId');
        const transId = searchParams.get('transId');

        if (!nodeId || !transId) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'nodeId and transId are required' },
                { status: 400 }
            );
        }

        const service = getTransactionService(parseInt(nodeId));
        const success = await service.deleteTransaction(parseInt(transId));

        if (!success) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: 'Transaction not found' },
                { status: 404 }
            );
        }

        // Trigger replication to other nodes
        const replicationResult = await ReplicationService.replicateDelete(parseInt(nodeId), parseInt(transId));

        return NextResponse.json<ApiResponse>({
            success: true,
            data: { 
                trans_id: parseInt(transId),
                replication: replicationResult
            },
            nodeId: parseInt(nodeId)
        });

    } catch (error: any) {
        console.error('DELETE /api/transactions error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
