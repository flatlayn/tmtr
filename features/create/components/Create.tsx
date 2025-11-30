import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Field, FieldGroup, FieldLabel, FieldSet} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {useState} from "react";

interface NodeStatus {
    nodeId: number;
    isHealthy: boolean;
    lastChecked: string; // Not strictly needed, but good practice
}

interface CreateTransactionProps {
    nodeStatuses: NodeStatus[];
}

interface NewTransaction {
    trans_type: string;
    operation: string;
    amount: number;
    balance: number;
}

const findAvailableNode = (statuses: NodeStatus[]): number | null => {
    // Node 0 has priority
    const node0 = statuses.find(s => s.nodeId === 0);
    if (node0?.isHealthy) return 0;

    // Fallback to Node 1 or Node 2
    const availableFallback = statuses.find(s => s.isHealthy && s.nodeId !== 0);
    return availableFallback ? availableFallback.nodeId : null;
};

export default function CreateTransaction({ nodeStatuses } : CreateTransactionProps) {
    const [formData, setFormData] = useState<Partial<NewTransaction>>({});
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = (field: keyof NewTransaction, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        if (!formData.trans_type || !formData.operation || !formData.amount || !formData.balance) {
            setMessage('Please fill out all required fields.');
            setIsLoading(false);
            return;
        }

        const initiatingNodeId = findAvailableNode(nodeStatuses);

        if (initiatingNodeId === null) {
            setMessage('All database nodes are currently unavailable. The system cannot initiate the transaction.');
            setIsLoading(false);
            return;
        }

        setMessage(`Attempting creation on Node ${initiatingNodeId}...`);

        try {
            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId: initiatingNodeId,
                    transaction: {
                        ...formData,
                        amount: parseFloat(formData.amount as any),
                        balance: parseFloat(formData.balance as any),
                    } as NewTransaction,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setMessage(`Success! Created Trans ID ${data.data.trans_id} on Node ${initiatingNodeId}. Replication initiated.`);
                setFormData({});
                // Optional: Trigger parent refresh here to update the transaction list
            } else {
                setMessage(`Error from Node ${initiatingNodeId}: ${data.error || 'Failed to create transaction.'}`);
            }
        } catch (error) {
            console.error('Create failed:', error);
            setMessage('An unexpected network error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className='border-1 rounded-md p-3 bg-white drop-shadow-sm gap-3'>
            <h2 className='ml-1 mb-2 text-xl font-semibold'>Create</h2>
            <div className='flex w-full gap-5'>
                <Select
                    onValueChange={(value) => handleInputChange('trans_type', value)}
                    value={formData.trans_type}
                    disabled={isLoading}
                >
                    <SelectTrigger className='w-full'>
                        <SelectValue placeholder="Type"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='credit'>Credit</SelectItem>
                        <SelectItem value='debit'>Debit</SelectItem>
                        <SelectItem value='vyber'>VYBER</SelectItem>
                    </SelectContent>
                </Select>
                <Select
                    onValueChange={(value) => handleInputChange('operation', value)}
                    value={formData.operation}
                    disabled={isLoading}
                >
                    <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Operation'></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='cic'>Credit in Cash</SelectItem>
                        <SelectItem value='cab'>Collection from Another Bank</SelectItem>
                        <SelectItem value='rab>'>Remittance from Another Bank</SelectItem>
                        <SelectItem value='wic'>Withdrawal in Cash</SelectItem>
                        <SelectItem value='ccw'>Credit Card Withdrawal</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <form className='mt-2'>
                <FieldSet>
                    <FieldGroup>
                        <div className='flex gap-5'>
                            <Field>
                                <FieldLabel className='ml-1'>Amount</FieldLabel>
                                <Input
                                    placeholder='In PHP'
                                    type='number'
                                    step='0.01'
                                    onChange={(e) => handleInputChange('amount', e.target.value)}
                                    value={formData.amount || ''}
                                    disabled={isLoading}
                                ></Input>
                            </Field>
                            <Field>
                                <FieldLabel className='ml-1'>Balance</FieldLabel>
                                <Input
                                    placeholder='In PHP'
                                    type='number'
                                    step='0.01'
                                    onChange={(e) => handleInputChange('balance', e.target.value)}
                                    value={formData.balance || ''}
                                    disabled={isLoading}
                                ></Input>
                            </Field>
                        </div>
                    </FieldGroup>
                </FieldSet>
            </form>
            <Button className='mt-3' type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create'}
            </Button>
            {message && <p className={`mt-3 text-sm ${message.startsWith('❌') ? 'text-red-600' : 'text-gray-700'}`}>{message}</p>}
        </div>
    );
}