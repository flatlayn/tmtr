import { NextResponse } from 'next/server';
import { getTransactionService } from '@/lib/transactionService';

/**
 * Debug endpoint to check raw transaction data
 */
export async function GET() {
    try {
        const service = getTransactionService(0);
        const transactions = await service.getAllTransactions(5);
        
        return NextResponse.json({
            success: true,
            data: transactions,
            keys: transactions.length > 0 ? Object.keys(transactions[0]) : [],
            rawSample: transactions[0]
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
