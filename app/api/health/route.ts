import { NextRequest, NextResponse } from 'next/server';
import { checkNodeHealth } from '@/lib/db';
import { ApiResponse, NodeStatus } from '@/lib/types';

/**
 * GET /api/health
 * Check health status of all nodes or a specific node
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const nodeId = searchParams.get('nodeId');

        // Check specific node
        if (nodeId !== null) {
            const node = parseInt(nodeId);
            const isHealthy = await checkNodeHealth(node);
            
            const status: NodeStatus = {
                nodeId: node,
                isHealthy,
                lastChecked: new Date()
            };

            return NextResponse.json<ApiResponse>({
                success: true,
                data: status
            });
        }

        // Check all nodes
        const healthChecks = await Promise.allSettled([
            checkNodeHealth(0),
            checkNodeHealth(1),
            checkNodeHealth(2)
        ]);

        const statuses: NodeStatus[] = healthChecks.map((result, index) => ({
            nodeId: index,
            isHealthy: result.status === 'fulfilled' && result.value,
            lastChecked: new Date()
        }));

        return NextResponse.json<ApiResponse>({
            success: true,
            data: statuses
        });

    } catch (error: any) {
        console.error('GET /api/health error:', error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
