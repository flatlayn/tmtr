"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

interface NodeStatus {
    nodeId: number;
    isHealthy: boolean;
    lastChecked: string;
}

interface RecoveryTestResult {
    testCase: string;
    nodeId: number;
    success: boolean;
    queuedOperations: number;
    recoveredOperations: number;
    duration: number;
    timestamp: string;
    details: string;
}

interface RecoveryTestProps {
    nodeStatuses: NodeStatus[];
    onRefreshHealth: () => void;
}

export default function RecoveryTest({ nodeStatuses, onRefreshHealth }: RecoveryTestProps) {
    const [testCase, setTestCase] = useState<string>('');
    const [targetNode, setTargetNode] = useState<string>('');
    const [transId, setTransId] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [simulatedFailures, setSimulatedFailures] = useState<number[]>([]);
    const [results, setResults] = useState<RecoveryTestResult[]>([]);
    const [message, setMessage] = useState('');
    const [queueStatus, setQueueStatus] = useState<any>(null);

    useEffect(() => {
        loadQueueStatus();
        const interval = setInterval(loadQueueStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadQueueStatus = async () => {
        try {
            const response = await fetch('/api/recovery/queue-status');
            const result = await response.json();
            if (result.success) {
                setQueueStatus(result.data);
            }
        } catch (error) {
            console.error('Failed to load queue status:', error);
        }
    };

    const simulateFailure = (nodeId: number) => {
        setSimulatedFailures([...simulatedFailures, nodeId]);
        setMessage(`⚠️ Node ${nodeId} simulated as offline`);
    };

    const bringOnline = (nodeId: number) => {
        setSimulatedFailures(simulatedFailures.filter(id => id !== nodeId));
        setMessage(`✅ Node ${nodeId} brought back online`);
        onRefreshHealth();
    };

    const runRecoveryTest = async () => {
        if (!testCase || !targetNode) {
            setMessage('Please select test case and target node');
            return;
        }

        setIsRunning(true);
        setMessage('Running recovery test...');

        try {
            const response = await fetch('/api/recovery/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    testCase: parseInt(testCase),
                    targetNodeId: parseInt(targetNode),
                    transId: transId ? parseInt(transId) : undefined,
                    simulatedFailures
                })
            });

            const result = await response.json();

            if (result.success) {
                const newResult: RecoveryTestResult = {
                    testCase: `Case ${testCase}`,
                    nodeId: parseInt(targetNode),
                    success: result.data.success,
                    queuedOperations: result.data.queuedOperations || 0,
                    recoveredOperations: result.data.recoveredOperations || 0,
                    duration: result.data.duration,
                    timestamp: new Date().toLocaleString(),
                    details: result.data.details || ''
                };
                setResults([newResult, ...results]);
                setMessage(`✅ Test completed: ${result.data.details}`);
                loadQueueStatus();
            } else {
                setMessage(`❌ Test failed: ${result.error}`);
            }
        } catch (error: any) {
            setMessage(`❌ Error: ${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const syncNode = async (nodeId: number) => {
        setIsRunning(true);
        setMessage(`Syncing Node ${nodeId}...`);

        try {
            const response = await fetch('/api/replication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SYNC',
                    recoveredNodeId: nodeId
                })
            });

            const result = await response.json();
            if (result.success) {
                setMessage(`✅ Synced ${result.data.synced} transactions to Node ${nodeId}`);
                loadQueueStatus();
            } else {
                setMessage(`❌ Sync failed: ${result.data.errors.join(', ')}`);
            }
        } catch (error: any) {
            setMessage(`❌ Error: ${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const clearResults = () => {
        setResults([]);
        setMessage('');
    };

    return (
        <div className="space-y-6">
            {/* Node Failure Simulator */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                    Node Failure Simulator
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Simulate node failures and test recovery mechanisms
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {nodeStatuses.map((status) => {
                        const isSimulatedOffline = simulatedFailures.includes(status.nodeId);
                        const effectiveStatus = isSimulatedOffline ? false : status.isHealthy;

                        return (
                            <div
                                key={status.nodeId}
                                className={`border-2 rounded-lg p-4 ${
                                    effectiveStatus
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                        : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold">
                                        Node {status.nodeId}
                                        {status.nodeId === 0 && ' (Central)'}
                                    </h3>
                                    {effectiveStatus ? (
                                        <CheckCircle className="text-green-500" size={20} />
                                    ) : (
                                        <AlertCircle className="text-red-500" size={20} />
                                    )}
                                </div>
                                <div className="text-sm mb-3">
                                    Status: <span className={effectiveStatus ? 'text-green-600' : 'text-red-600'}>
                                        {isSimulatedOffline ? 'Simulated Offline' : effectiveStatus ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                                {effectiveStatus ? (
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => simulateFailure(status.nodeId)}
                                        className="w-full"
                                    >
                                        Simulate Failure
                                    </Button>
                                ) : (
                                    <div className="space-y-2">
                                        {isSimulatedOffline && (
                                            <Button
                                                size="sm"
                                                variant="default"
                                                onClick={() => bringOnline(status.nodeId)}
                                                className="w-full"
                                            >
                                                Bring Online
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => syncNode(status.nodeId)}
                                            disabled={isRunning || !effectiveStatus}
                                            className="w-full"
                                        >
                                            <RefreshCw size={16} className="mr-2" />
                                            Sync Node
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Queue Status */}
                {queueStatus && queueStatus.pendingCount > 0 && (
                    <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                                    Queued Operations
                                </h4>
                                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                    {queueStatus.pendingCount} operations waiting to be replicated
                                </p>
                            </div>
                            <Button
                                size="sm"
                                onClick={loadQueueStatus}
                            >
                                Refresh
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Recovery Test Configuration */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                    Recovery Test Configuration
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Test Case Selection */}
                    <FieldGroup>
                        <FieldLabel>Recovery Test Case *</FieldLabel>
                        <Select value={testCase} onValueChange={setTestCase}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select test case" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Case 1: Partition → Central Failure</SelectItem>
                                <SelectItem value="2">Case 2: Central Node Recovery</SelectItem>
                                <SelectItem value="3">Case 3: Central → Partition Failure</SelectItem>
                                <SelectItem value="4">Case 4: Partition Node Recovery</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-1">
                            {testCase === '1' && 'Write from partition fails to replicate to central node'}
                            {testCase === '2' && 'Central node recovers and syncs missed transactions'}
                            {testCase === '3' && 'Write from central fails to replicate to partition'}
                            {testCase === '4' && 'Partition node recovers and syncs missed transactions'}
                        </p>
                    </FieldGroup>

                    {/* Target Node */}
                    <FieldGroup>
                        <FieldLabel>Target Node *</FieldLabel>
                        <Select value={targetNode} onValueChange={setTargetNode}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select node" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">Node 0 (Central)</SelectItem>
                                <SelectItem value="1">Node 1 (Partition)</SelectItem>
                                <SelectItem value="2">Node 2 (Partition)</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldGroup>

                    {/* Transaction ID (optional) */}
                    <FieldGroup>
                        <FieldLabel>Transaction ID (Optional)</FieldLabel>
                        <Input
                            type="number"
                            value={transId}
                            onChange={(e) => setTransId(e.target.value)}
                            placeholder="Leave empty to create new"
                        />
                    </FieldGroup>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                    <Button
                        onClick={runRecoveryTest}
                        disabled={isRunning}
                        className="flex-1"
                    >
                        {isRunning ? 'Running Test...' : 'Run Recovery Test'}
                    </Button>
                    <Button
                        onClick={clearResults}
                        variant="outline"
                        disabled={results.length === 0}
                    >
                        Clear Results
                    </Button>
                </div>

                {/* Status Message */}
                {message && (
                    <div className={`mt-4 p-3 rounded ${
                        message.includes('✅') ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        message.includes('❌') ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        message.includes('⚠️') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                        {message}
                    </div>
                )}
            </div>

            {/* Test Results */}
            {results.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                        Recovery Test Results
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b dark:border-slate-700">
                                    <th className="text-left p-2">Timestamp</th>
                                    <th className="text-left p-2">Test Case</th>
                                    <th className="text-center p-2">Node</th>
                                    <th className="text-center p-2">Status</th>
                                    <th className="text-right p-2">Queued</th>
                                    <th className="text-right p-2">Recovered</th>
                                    <th className="text-right p-2">Duration (ms)</th>
                                    <th className="text-left p-2">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((result, index) => (
                                    <tr key={index} className="border-b dark:border-slate-700">
                                        <td className="p-2 text-slate-600 dark:text-slate-400">
                                            {result.timestamp}
                                        </td>
                                        <td className="p-2 font-medium">{result.testCase}</td>
                                        <td className="p-2 text-center">Node {result.nodeId}</td>
                                        <td className="p-2 text-center">
                                            {result.success ? (
                                                <span className="text-green-600 dark:text-green-400">✓ Success</span>
                                            ) : (
                                                <span className="text-red-600 dark:text-red-400">✗ Failed</span>
                                            )}
                                        </td>
                                        <td className="p-2 text-right">{result.queuedOperations}</td>
                                        <td className="p-2 text-right">{result.recoveredOperations}</td>
                                        <td className="p-2 text-right">{result.duration.toFixed(2)}</td>
                                        <td className="p-2 text-slate-600 dark:text-slate-400">
                                            {result.details}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Test Case Descriptions */}
            <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-sm">
                <h4 className="font-semibold mb-2">Recovery Test Case Details:</h4>
                <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                    <li><strong>Case 1:</strong> Write operation from Node 1/2 fails to replicate to Node 0 (queued)</li>
                    <li><strong>Case 2:</strong> Node 0 recovers from failure and syncs missed transactions from partitions</li>
                    <li><strong>Case 3:</strong> Write operation from Node 0 fails to replicate to Node 1/2 (queued)</li>
                    <li><strong>Case 4:</strong> Node 1/2 recovers from failure and syncs missed transactions from Node 0</li>
                </ul>
            </div>
        </div>
    );
}
