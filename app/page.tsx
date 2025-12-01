'use client';

import { useState, useEffect } from 'react';
import { Database, Activity, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import {Input} from "@/components/ui/input";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Field, FieldGroup, FieldLabel, FieldLegend, FieldSet} from "@/components/ui/field";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import CreateTransaction from "@/features/create/components/Create";
import EditTransaction from "@/features/edit/components/Edit";
import DeleteTransaction from "@/features/delete/components/Delete";
import ConcurrencyTest from "@/features/concurrency/components/ConcurrencyTest";
import RecoveryTest from "@/features/recovery/components/RecoveryTest";

interface NodeStatus {
  nodeId: number;
  isHealthy: boolean;
  lastChecked: string;
}

interface Transaction {
  trans_id: number;
  account_id: number;
  trans_date: string;
  type: string;
  operation: string;
  amount: number;
  balance: number;
}

export default function Home() {
  const [nodeStatuses, setNodeStatuses] = useState<NodeStatus[]>([]);
  const [transactions, setTransactions] = useState<{ [key: string]: Transaction[] }>({});
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<number>(0);

  useEffect(() => {
    checkHealth();
    loadTransactions();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      checkHealth();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health');
      const result = await response.json();
      if (result.success) {
        setNodeStatuses(result.data);
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const loadTransactions = async (nodeId?: number) => {
    setLoading(true);
    try {
      const url = nodeId !== undefined 
        ? `/api/transactions?nodeId=${nodeId}&limit=10` 
        : '/api/transactions?limit=10';
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setTransactions(result.data);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncNode = async (nodeId: number) => {
    if (!confirm(`Are you sure you want to sync Node ${nodeId}? This will recover missed transactions.`)) {
      return;
    }

    setLoading(true);
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
        alert(`Successfully synced ${result.data.synced} transactions to Node ${nodeId}`);
        loadTransactions();
      } else {
        alert(`Sync failed: ${result.data.errors.join(', ')}`);
      }
    } catch (error: any) {
      alert(`Sync error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getNodeName = (nodeId: number) => {
    switch (nodeId) {
      case 0: return 'Central Node';
      case 1: return 'Partition Node 1';
      case 2: return 'Partition Node 2';
      default: return `Node ${nodeId}`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-5">
            Distributed Database Management System
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Transaction Management & Replication Monitor | STADVDB S19 Group 2
          </p>
        </div>

        {/* Node Health Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          {nodeStatuses.map((status) => (
            <div
              key={status.nodeId}
              className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 border-2 transition-all ${
                status.isHealthy
                  ? 'border-green-500 hover:shadow-xl'
                  : 'border-red-500 animate-pulse'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Database className={status.isHealthy ? 'text-green-500' : 'text-red-500'} size={24} />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {getNodeName(status.nodeId)}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Port: {60727 + status.nodeId}
                    </p>
                  </div>
                </div>
                {status.isHealthy ? (
                  <CheckCircle className="text-green-500" size={20} />
                ) : (
                  <AlertCircle className="text-red-500" size={20} />
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  status.isHealthy ? 'text-green-600' : 'text-red-600'
                }`}>
                  {status.isHealthy ? 'Online' : 'Offline'}
                </span>
                {!status.isHealthy && (
                  <button
                    onClick={() => syncNode(status.nodeId)}
                    disabled={loading}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw size={14} />
                    Sync
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="view" className="mb-8">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="crud">CRUD</TabsTrigger>
            <TabsTrigger value="concurrency">Concurrency</TabsTrigger>
            <TabsTrigger value="recovery">Recovery</TabsTrigger>
          </TabsList>

          {/* View Tab */}
          <TabsContent value="view">
            {/* Actions Bar */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Activity className="text-blue-500" size={24}/>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Transaction Viewer
                  </h2>
                </div>

                <div className="flex items-center gap-4">
                  <select
                      value={selectedNode}
                      onChange={(e) => {
                        const node = parseInt(e.target.value);
                        setSelectedNode(node);
                        loadTransactions(node);
                      }}
                      className="px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value={0}>Node 0 (Central)</option>
                    <option value={1}>Node 1 (Partition)</option>
                    <option value={2}>Node 2 (Partition)</option>
                  </select>

                  <button
                      onClick={() => loadTransactions(selectedNode)}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Trans ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Operation
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                          Loading transactions...
                        </td>
                      </tr>
                    ) : transactions[`node${selectedNode}`]?.length > 0 ? (
                      transactions[`node${selectedNode}`].map((trans) => (
                        <tr key={trans.trans_id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                            {trans.trans_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                            {trans.type || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                            {trans.operation}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900 dark:text-white font-medium">
                            ${trans.amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900 dark:text-white font-medium">
                            ${trans.balance.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* CRUD Tab */}
          <TabsContent value="crud">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CreateTransaction nodeStatuses={nodeStatuses} />
              <EditTransaction />
              <DeleteTransaction />
            </div>
          </TabsContent>

          {/* Concurrency Tab */}
          <TabsContent value="concurrency">
            <ConcurrencyTest />
          </TabsContent>

          {/* Recovery Tab */}
          <TabsContent value="recovery">
            <RecoveryTest nodeStatuses={nodeStatuses} onRefreshHealth={checkHealth} />
          </TabsContent>
        </Tabs>

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>MCO2 - Distributed Database System | STADVDB S19 Group 2</p>
        </div>
      </div>
    </div>
  );
}
