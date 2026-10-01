import { useState, useEffect } from 'react';
import {
    getMyTickets,
    getMyTicketById,
    createTicket,
    replyToTicket,
    SupportTicket,
} from '../../../services/api/supportTicketService';
import { useToast } from '../../../context/ToastContext';

export default function SellerSupportTickets() {
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const [category, setCategory] = useState('Other');
    const [priority, setPriority] = useState('Medium');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);

    const fetchTickets = async () => {
        try {
            setLoading(true);
            const response = await getMyTickets();
            if (response.success && response.data) setTickets(response.data);
        } catch (err) {
            showToast('Failed to load tickets', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
    }, []);

    const openTicket = async (id: string) => {
        try {
            const response = await getMyTicketById(id);
            if (response.success && response.data) setSelectedTicket(response.data);
        } catch (err) {
            showToast('Failed to load ticket', 'error');
        }
    };

    const handleCreate = async () => {
        if (!subject.trim() || !description.trim()) {
            showToast('Subject and description are required', 'error');
            return;
        }
        try {
            setCreating(true);
            const response = await createTicket({ category, priority, subject, description });
            if (response.success) {
                showToast('Support ticket raised', 'success');
                setIsCreateOpen(false);
                setSubject('');
                setDescription('');
                setCategory('Other');
                setPriority('Medium');
                fetchTickets();
            } else {
                showToast(response.message || 'Failed to raise ticket', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to raise ticket', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleReply = async () => {
        if (!selectedTicket || !replyText.trim()) return;
        try {
            setSending(true);
            const response = await replyToTicket(selectedTicket._id, replyText.trim());
            if (response.success && response.data) {
                setSelectedTicket(response.data);
                setReplyText('');
                fetchTickets();
            }
        } catch (err) {
            showToast('Failed to send reply', 'error');
        } finally {
            setSending(false);
        }
    };

    const statusBadge = (status: SupportTicket['status']) => {
        const styles: Record<SupportTicket['status'], string> = {
            Open: 'bg-blue-100 text-blue-800',
            'In Progress': 'bg-amber-100 text-amber-800',
            Resolved: 'bg-green-100 text-green-800',
            Closed: 'bg-neutral-100 text-neutral-600',
        };
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>;
    };

    if (selectedTicket) {
        return (
            <div className="flex flex-col h-full">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col h-full">
                    <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between">
                        <div>
                            <button onClick={() => setSelectedTicket(null)} className="text-teal-100 hover:text-white text-xs mb-1">← Back to tickets</button>
                            <h2 className="text-lg font-semibold">{selectedTicket.subject}</h2>
                        </div>
                        {statusBadge(selectedTicket.status)}
                    </div>
                    <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                            <p className="text-xs text-neutral-500 mb-1">{selectedTicket.category} · {selectedTicket.priority} priority</p>
                            <p className="text-sm text-neutral-800">{selectedTicket.description}</p>
                        </div>
                        {selectedTicket.messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'Seller' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${msg.sender === 'Seller' ? 'bg-teal-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                                    <p className="text-xs opacity-70 mb-1">{msg.sender === 'Seller' ? 'You' : 'Support Team'} · {new Date(msg.createdAt).toLocaleString('en-GB')}</p>
                                    <p>{msg.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    {selectedTicket.status !== 'Closed' && (
                        <div className="p-4 border-t border-neutral-200 flex gap-2">
                            <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                                placeholder="Type your reply..."
                                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                            />
                            <button
                                onClick={handleReply}
                                disabled={sending || !replyText.trim()}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                Send
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Support Tickets</h2>
                        <p className="text-sm text-teal-100 mt-1">Need help? Raise a ticket and chat with our support team.</p>
                    </div>
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-white text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        + Raise Ticket
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-neutral-500">Loading tickets...</div>
                ) : tickets.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">
                        <p>No support tickets yet.</p>
                        <p className="text-xs mt-1">Check the FAQ, or raise a ticket if you need help.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-neutral-200">
                        {tickets.map((ticket) => (
                            <button
                                key={ticket._id}
                                onClick={() => openTicket(ticket._id)}
                                className="w-full text-left p-4 hover:bg-neutral-50 transition-colors flex items-center justify-between gap-4"
                            >
                                <div>
                                    <p className="text-sm font-medium text-neutral-800">{ticket.subject}</p>
                                    <p className="text-xs text-neutral-500 mt-0.5">{ticket.category} · {ticket.priority} priority · {ticket.messages.length} message(s)</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="text-xs text-neutral-400">{new Date(ticket.updatedAt).toLocaleDateString('en-GB')}</span>
                                    {statusBadge(ticket.status)}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setIsCreateOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">Raise a Support Ticket</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
                                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white">
                                        <option value="Payment">Payment</option>
                                        <option value="Product">Product</option>
                                        <option value="Order">Order</option>
                                        <option value="Technical">Technical</option>
                                        <option value="Account">Account</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Priority</label>
                                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white">
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Subject</label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium">
                                Cancel
                            </button>
                            <button onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium disabled:opacity-50">
                                {creating ? 'Submitting...' : 'Submit Ticket'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
