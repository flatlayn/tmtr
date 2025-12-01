import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Field, FieldGroup, FieldLabel, FieldSet} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {useCallback, useRef, useState} from "react";
import {debounce} from "next/dist/server/utils";


interface TransactionUpdates {
    type?: string;
    operation?: string;
    amount?: number;
    balance?: number;
}

export default function EditTransaction() {
    const [transId, setTransId] = useState('');
    const [updates, setUpdates] = useState<TransactionUpdates>({});
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [originalData, setOriginalData] = useState<any>(null);

    const handleUpdateChange = useCallback((key: keyof TransactionUpdates, value: any) => {
        if (value === null || value === undefined || value === '') {
            setUpdates(prev => {
                const newState = { ...prev };
                delete newState[key]; // Remove the key if value is empty/null
                return newState;
            });
            return;
        }

        let parsedValue = value;
        if (key === 'amount' || key === 'balance') {
            parsedValue = parseFloat(value);
        }

        setUpdates(prev => ({ ...prev, [key]: parsedValue }));
    }, []);

    const handleFetchTransaction = async (id: string) => {
        const numericId = parseInt(id);
        if (isNaN(numericId) || numericId <= 0) return;

        setIsLoading(true);
        setMessage('Fetching transaction data...');

        try {
            // Fetch from the primary node (Node 0)
            const response = await fetch(`/api/transactions?nodeId=0&transId=${id}`);
            const data = await response.json();

            if (response.ok && data.success && data.data) {
                const trans = data.data;
                setOriginalData(trans); // Store for reference
                setMessage(`Loaded Transaction ID ${id}. Ready to edit.`);
            } else {
                setMessage(`Error fetching transaction: ${data.error || 'Not found'}`);
                setOriginalData(null);
            }
        } catch (error) {
            setMessage('Network error during fetch.');
        } finally {
            setIsLoading(false);
        }
    };

    const debouncedFetch = useRef(
        debounce((id: string) => handleFetchTransaction(id), 500) // 500ms delay
    ).current;

    const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const id = e.target.value;
        setTransId(id); // Synchronously update the displayed ID

        // Only call the debounced function, which will wait 500ms before fetching
        if (id) {
            debouncedFetch(id);
        } else {
            // If the field is cleared, reset the debouncer and data
            setOriginalData(null);
            setMessage('');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!transId || Object.keys(updates).length === 0) {
            setMessage('Please enter a Transaction ID and make at least one change.');
            return;
        }

        setIsLoading(true);
        setMessage('Attempting to update and replicate...');

        try {
            // We initiate the update on the primary node (Node 0)
            const initiatingNodeId = 0;

            const response = await fetch(`/api/transactions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId: initiatingNodeId,
                    transId: parseInt(transId),
                    updates: updates, // Only send the changed fields
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setMessage(`Success! Transaction ${transId} updated on Node ${initiatingNodeId}. Replication initiated.`);
                setUpdates({}); // Clear updates
                setOriginalData(null);
                setTransId('');
            } else {
                setMessage(`Error updating transaction: ${data.error || 'Unknown failure'}`);
            }
        } catch (error) {
            console.error('Update failed:', error);
            setMessage('An unexpected network error occurred during PUT request.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className='border-1 rounded-md p-3 bg-white drop-shadow-sm gap-3'>
            <h2 className='ml-1 mb-2 text-xl font-semibold'>Edit</h2>
            <form onSubmit={handleSubmit}>
                <Field className='mb-5'>
                    <Input
                        placeholder='Transaction ID'
                        value={transId}
                        type='number'
                        onChange={handleIdChange}
                        disabled={isLoading}
                    ></Input>
                </Field>
            </form>
            <div className='flex w-full gap-5'>
                <Select
                    onValueChange={(value) => handleUpdateChange('type', value)}
                    value={updates.type || originalData?.type}
                    disabled={isLoading}
                >
                    <SelectTrigger className='w-full'>
                        <SelectValue placeholder="Type"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='Credit'>Credit</SelectItem>
                        <SelectItem value='Debit (Withdrawal)'>Debit (Withdrawal)</SelectItem>
                        <SelectItem value='VYBER'>VYBER</SelectItem>
                    </SelectContent>
                </Select>
                <Select
                    onValueChange={(value) => handleUpdateChange('operation', value)}
                    value={updates.operation || originalData?.operation}
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
                                    value={updates.amount || ''}
                                    onChange={(e) => handleUpdateChange('amount', e.target.value)}
                                    disabled={isLoading}
                                ></Input>
                            </Field>
                            <Field>
                                <FieldLabel className='ml-1'>Balance</FieldLabel>
                                <Input
                                    placeholder='In PHP'
                                    type='number'
                                    step='0.01'
                                    value={updates.balance || ''}
                                    onChange={(e) => handleUpdateChange('balance', e.target.value)}
                                    disabled={isLoading}
                                ></Input>
                            </Field>
                        </div>
                    </FieldGroup>
                </FieldSet>
            </form>
            <Button className='mt-3' type="submit" disabled={isLoading || Object.keys(updates).length === 0}>
                {isLoading ? 'Updating...' : 'Save Edit'}
            </Button>
        </div>
    );
}