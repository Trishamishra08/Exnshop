import { useState, useEffect } from 'react';
import {
    getAllTickets,
    getTicketByIdAdmin,
    replyToTicketAsAdmin,
} from '../../../services/api/admin/adminSupportTicketService';
import { SupportTicket } from '../../../services/api/supportTicketService';
import { useToast } from '../../../context/ToastContext';

export default function AdminSupportTickets() {
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const fetchTickets = async () => {
        try {
            setLoading(true);
            const response = await getAllTickets(statusFilter || undefined);
            if (response.success && response.data) setTickets(response.data);
        } catch (err) {
            showToast('Failed to load tickets', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const openTicket = async (id: string) => {
        try {
            const response = await getTicketByIdAdmin(id);
            if (response.success && response.data) setSelectedTicket(response.data);
        } catch (err) {
            showToast('Failed to load ticket', 'error');
        }
    };

    const getSellerLabel = (seller: SupportTicket['seller']) => {
        if (typeof seller === 'string') return seller;
        return seller?.storeName || seller?.sellerName || '—';
    };

    const handleReply = async (status?: string) => {
        if (!selectedTicket) return;
        if (!replyText.trim() && !status) return;
        try {
            setSending(true);
            const response = await replyToTicketAsAdmin(selectedTicket._id, replyText.trim(), status);
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
            <div className="flex flex-col h-full bg-gray-50 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col flex-1">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                        <div>
                            <button onClick={() => setSelectedTicket(null)} className="text-teal-100 hover:text-white text-xs mb-1">← Back to tickets</button>
                            <h2 className="text-lg font-semibold">{selectedTicket.subject}</h2>
                            <p className="text-sm text-teal-100 mt-1">{getSellerLabel(selectedTicket.seller)} · {selectedTicket.category} · {selectedTicket.priority} priority</p>
                        </div>
                        {statusBadge(selectedTicket.status)}
                    </div>
                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                            <p className="text-sm text-neutral-800">{selectedTicket.description}</p>
                        </div>
                        {selectedTicket.messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'Admin' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${msg.sender === 'Admin' ? 'bg-teal-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                                    <p className="text-xs opacity-70 mb-1">{msg.sender === 'Admin' ? 'You (Support)' : getSellerLabel(selectedTicket.seller)} · {new Date(msg.createdAt).toLocaleString('en-GB')}</p>
                                    <p>{msg.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-neutral-200 space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                                placeholder="Type your reply..."
                                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                            />
                            <button
                                onClick={() => handleReply()}
                                disabled={sending || !replyText.trim()}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                Send
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleReply('In Progress')} className="px-3 py-1.5 border border-amber-400 text-amber-700 hover:bg-amber-50 rounded text-xs font-medium">Mark In Progress</button>
                            <button onClick={() => handleReply('Resolved')} className="px-3 py-1.5 border border-green-500 text-green-700 hover:bg-green-50 rounded text-xs font-medium">Mark Resolved</button>
                            <button onClick={() => handleReply('Closed')} className="px-3 py-1.5 border border-neutral-400 text-neutral-700 hover:bg-neutral-50 rounded text-xs font-medium">Close Ticket</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">Seller Support Tickets</h2>
                            <p className="text-sm text-teal-100 mt-1">Respond to seller support requests.</p>
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800"
                        >
                            <option value="">All Statuses</option>
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                        </select>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading tickets...</div>
                    ) : tickets.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No support tickets found.</div>
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
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            {getSellerLabel(ticket.seller)} · {ticket.category} · {ticket.priority} priority · {ticket.messages.length} message(s)
                                        </p>
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
            </div>
        </div>
    );
}
