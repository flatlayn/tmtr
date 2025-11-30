import { NextRequest, NextResponse } from 'next/server';
import { ReplicationService } from '@/lib/replicationService';
import { ApiResponse } from '@/lib/types';
import {getTransactionService} from "@/lib/transactionService";

/**
 * POST /api/replication
 * Trigger manual replication or recovery operations
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, sourceNodeId, transId, transaction, updates } = body;

        switch (action) {
            case 'INSERT':
                const insertResult = await ReplicationService.replicateInsert(
                    sourceNodeId,
                    transId,
                    transaction
                );
                return NextResponse.json<ApiResponse>({
                    success: insertResult.success,
                    data: insertResult,
                });

            case 'UPDATE':
                const updateResult = await ReplicationService.replicateUpdate(
                    sourceNodeId,
                    transId,
                    updates
                );
                return NextResponse.json<ApiResponse>({
                    success: updateResult.success,
                    data: updateResult,
                });

            case 'DELETE':
                if (!transId) {
                    return NextResponse.json<ApiResponse>(
                        { success: false, error: 'transId is required for DELETE action' },
                        { status: 400 }
                    );
                }

                const localService = getTransactionService(sourceNodeId);

                const deleteSuccess = await localService.deleteTransaction(transId);

                return NextResponse.json<ApiResponse>({
                    success: deleteSuccess,
                    data: { transId, status: deleteSuccess ? 'deleted' : 'not found' },
                }, { status: deleteSuccess ? 200 : 404 });

            case 'SYNC':
                const { recoveredNodeId } = body;
                if (recoveredNodeId === undefined) {
                    return NextResponse.json<ApiResponse>(
                        { success: false, error: 'recoveredNodeId is required for SYNC action' },
                        { status: 400 }
                    );
                }
                const syncResult = await ReplicationService.syncNodeAfterRecovery(recoveredNodeId);
                return NextResponse.json<ApiResponse>({
                    success: syncResult.success,
                    data: syncResult,
                });

            default:
                return NextResponse.json<ApiResponse>(
                    { success: false, error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }

    } catch (error: any) {
        console.error('POST /api/replication error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
