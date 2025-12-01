import { NextRequest, NextResponse } from 'next/server';
import { PersistenceService } from '@/lib/persistenceService';
import { ApiResponse } from '@/lib/types';

/**
 * GET /api/recovery/queue-status
 * Get status of replication queue
 */
export async function GET(request: NextRequest) {
    try {
        // Get all pending jobs
        const jobs = await PersistenceService.getAllJobs();

        const pending = jobs.filter(j => j.status === 'pending').length;
        const processing = jobs.filter(j => j.status === 'processing').length;
        const failed = jobs.filter(j => j.status === 'failed').length;
        const completed = jobs.filter(j => j.status === 'completed').length;

        return NextResponse.json<ApiResponse>({
            success: true,
            data: {
                pending,
                processing,
                failed,
                completed,
                total: jobs.length,
                jobs: jobs.slice(0, 10) // Return first 10 jobs
            }
        });

    } catch (error: any) {
        console.error('GET /api/recovery/queue-status error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
