"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface TestResult {
    testCase: string;
    isolationLevel: string;
    duration: number;
    successCount: number;
    failureCount: number;
    conflicts: string[];
    timestamp: string;
}

export default function ConcurrencyTest() {
    const [testCase, setTestCase] = useState<string>('');
    const [isolationLevel, setIsolationLevel] = useState<string>('');
    const [transId, setTransId] = useState<string>('');
    const [numTransactions, setNumTransactions] = useState<string>('5');
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<TestResult[]>([]);
    const [message, setMessage] = useState('');

    const runTest = async () => {
        if (!testCase || !isolationLevel || !transId) {
            setMessage('Please fill all required fields');
            return;
        }

        setIsRunning(true);
        setMessage('Running concurrency test...');

        try {
            const response = await fetch('/api/concurrency/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    testCase: parseInt(testCase),
                    isolationLevel,
                    transId: parseInt(transId),
                    numTransactions: parseInt(numTransactions)
                })
            });

            const result = await response.json();

            if (result.success) {
                const newResult: TestResult = {
                    testCase: `Case ${testCase}`,
                    isolationLevel,
                    duration: result.data.duration,
                    successCount: result.data.successCount,
                    failureCount: result.data.failureCount,
                    conflicts: result.data.conflicts || [],
                    timestamp: new Date().toLocaleString()
                };
                setResults([newResult, ...results]);
                setMessage(`✅ Test completed: ${result.data.successCount}/${numTransactions} successful`);
            } else {
                setMessage(`❌ Test failed: ${result.error}`);
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
            {/* Test Configuration */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                    Concurrency Test Simulator
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Test concurrent transaction execution across multiple nodes
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Test Case Selection */}
                    <FieldGroup>
                        <FieldLabel>Test Case *</FieldLabel>
                        <Select value={testCase} onValueChange={setTestCase}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select test case" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Case 1: Concurrent Reads</SelectItem>
                                <SelectItem value="2">Case 2: Read + Write</SelectItem>
                                <SelectItem value="3">Case 3: Concurrent Writes</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-1">
                            {testCase === '1' && 'Multiple transactions reading same data'}
                            {testCase === '2' && 'One writing, others reading same data'}
                            {testCase === '3' && 'Multiple transactions writing same data'}
                        </p>
                    </FieldGroup>

                    {/* Isolation Level Selection */}
                    <FieldGroup>
                        <FieldLabel>Isolation Level *</FieldLabel>
                        <Select value={isolationLevel} onValueChange={setIsolationLevel}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select isolation level" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="READ UNCOMMITTED">Read Uncommitted</SelectItem>
                                <SelectItem value="READ COMMITTED">Read Committed</SelectItem>
                                <SelectItem value="REPEATABLE READ">Repeatable Read</SelectItem>
                                <SelectItem value="SERIALIZABLE">Serializable</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldGroup>

                    {/* Transaction ID */}
                    <FieldGroup>
                        <FieldLabel>Transaction ID *</FieldLabel>
                        <Input
                            type="number"
                            value={transId}
                            onChange={(e) => setTransId(e.target.value)}
                            placeholder="e.g., 12345"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            All concurrent operations will target this transaction
                        </p>
                    </FieldGroup>

                    {/* Number of Concurrent Transactions */}
                    <FieldGroup>
                        <FieldLabel>Concurrent Transactions</FieldLabel>
                        <Input
                            type="number"
                            value={numTransactions}
                            onChange={(e) => setNumTransactions(e.target.value)}
                            placeholder="5"
                            min="2"
                            max="20"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Number of simultaneous operations (2-20)
                        </p>
                    </FieldGroup>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                    <Button
                        onClick={runTest}
                        disabled={isRunning}
                        className="flex-1"
                    >
                        {isRunning ? 'Running Test...' : 'Run Test'}
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
                        Test Results
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b dark:border-slate-700">
                                    <th className="text-left p-2">Timestamp</th>
                                    <th className="text-left p-2">Test Case</th>
                                    <th className="text-left p-2">Isolation Level</th>
                                    <th className="text-right p-2">Duration (ms)</th>
                                    <th className="text-right p-2">Success</th>
                                    <th className="text-right p-2">Failures</th>
                                    <th className="text-left p-2">Conflicts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((result, index) => (
                                    <tr key={index} className="border-b dark:border-slate-700">
                                        <td className="p-2 text-slate-600 dark:text-slate-400">
                                            {result.timestamp}
                                        </td>
                                        <td className="p-2 font-medium">{result.testCase}</td>
                                        <td className="p-2">{result.isolationLevel}</td>
                                        <td className="p-2 text-right">{result.duration.toFixed(2)}</td>
                                        <td className="p-2 text-right text-green-600 dark:text-green-400">
                                            {result.successCount}
                                        </td>
                                        <td className="p-2 text-right text-red-600 dark:text-red-400">
                                            {result.failureCount}
                                        </td>
                                        <td className="p-2">
                                            {result.conflicts.length > 0 ? (
                                                <span className="text-yellow-600 dark:text-yellow-400">
                                                    {result.conflicts.length} conflicts
                                                </span>
                                            ) : (
                                                <span className="text-green-600 dark:text-green-400">None</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Statistics */}
                    <div className="mt-4 grid grid-cols-3 gap-4">
                        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded">
                            <div className="text-sm text-slate-600 dark:text-slate-400">Total Tests</div>
                            <div className="text-2xl font-bold">{results.length}</div>
                        </div>
                        <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                            <div className="text-sm text-green-600 dark:text-green-400">Avg Success Rate</div>
                            <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                                {results.length > 0
                                    ? ((results.reduce((sum, r) => sum + r.successCount, 0) / 
                                       results.reduce((sum, r) => sum + r.successCount + r.failureCount, 0)) * 100).toFixed(1)
                                    : 0}%
                            </div>
                        </div>
                        <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded">
                            <div className="text-sm text-blue-600 dark:text-blue-400">Avg Duration</div>
                            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                {(results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(0)} ms
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Test Case Descriptions */}
            <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-sm">
                <h4 className="font-semibold mb-2">Test Case Details:</h4>
                <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                    <li><strong>Case 1:</strong> Multiple SELECT queries reading the same transaction simultaneously</li>
                    <li><strong>Case 2:</strong> One UPDATE operation while multiple SELECT queries read the same transaction</li>
                    <li><strong>Case 3:</strong> Multiple UPDATE operations modifying the same transaction simultaneously</li>
                </ul>
            </div>
        </div>
    );
}
