import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {useState} from "react";
import {
    Dialog, DialogClose,
    DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";

export default function DeleteTransaction() {
    const [transId, setTransId] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleInitialDeleteClick = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transId) {
            setMessage('Please enter a Transaction ID.');
            return;
        }
        setMessage('');
        setShowConfirm(true);
    };

    const handleConfirmDelete = async () => {
        setShowConfirm(false);

        setIsLoading(true);
        setMessage(`Attempting to delete Transaction ${transId}...`);

        try {
            const initialNode = 0;

            const res = await fetch(
                `/api/transactions?nodeId=${initialNode}&transId=${transId}`,
                {
                    method: 'DELETE',
                    headers: {'Content-Type': 'application/json'},
                }
            );

            const data = await res.json();
            if (res.ok && data.success) {
                setMessage(`Success! Transaction ${transId} deleted. Replication initiated.`);
                setTransId('');
            } else {
                setMessage(`Error: ${data.error || 'Failed to delete transaction.'}`);
            }

            } catch (error) {
                console.error('Delete failed:', error);
                setMessage('An unexpected network error occurred.');
            } finally {
                setIsLoading(false);
            }
        };

    const handleCancel = () => {
        setShowConfirm(false);
        setMessage('');
    }


    return (
        <div className='border-1 rounded-md p-3 bg-white drop-shadow-sm gap-3'>
            <h2 className='ml-1 mb-2 text-xl font-semibold'>Delete Transaction</h2>

            {/* The Dialog is now controlled by the 'showConfirm' state */}
            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>

                {/* Form to capture ID and trigger the opening of the dialog */}
                <form onSubmit={handleInitialDeleteClick}>
                    <Input
                        placeholder='Transaction ID'
                        value={transId}
                        onChange={(e) => setTransId(e.target.value)}
                        type="number"
                        disabled={isLoading}
                    />
                    {/* This button triggers the handleInitialDeleteClick validation and dialog open */}
                    <Button type="submit" variant='destructive' className='mt-3' disabled={isLoading}>
                        Delete
                    </Button>
                </form>

                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Are you sure you want to permanently delete Transaction
                            ID {transId} from all nodes?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                        </DialogClose>

                        {/* This button executes the API call.
                            It calls handleConfirmDelete and does NOT rely on a form submit.
                        */}
                        <Button
                            variant='destructive'
                            onClick={handleConfirmDelete}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Deleting...' : 'Confirm Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Display status message */}
            {message &&
                <p className={`mt-3 text-sm ${message.startsWith('❌') ? 'text-red-600' : 'text-gray-700'}`}>{message}</p>}
        </div>
    );
}