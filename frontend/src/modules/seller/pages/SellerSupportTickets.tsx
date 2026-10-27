import { useState, useEffect } from 'react';
import {
    getMyTickets,
    getMyTicketById,
    createTicket,
    replyToTicket,
    closeTicket,
    SupportTicket,
    ticketStatusLabel,
    TICKET_STATUS_STYLES,
} from '../../../services/api/supportTicketService';
import { uploadDocuments } from '../../../services/api/uploadService';
import { useToast } from '../../../context/ToastContext';
import TicketTimeline from '../../../components/TicketTimeline';
import AttachmentList from '../../../components/AttachmentList';

const MAX_ATTACHMENTS = 5;

export default function SellerSupportTickets() {
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replyFiles, setReplyFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);

    const [category, setCategory] = useState('Other');
    const [priority, setPriority] = useState('Medium');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [createFiles, setCreateFiles] = useState<File[]>([]);
    const [creating, setCreating] = useState(false);

    const fetchTickets = async () => {
        try {
            setLoading(true);
            const response = await getMyTickets(statusFilter || undefined);
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
            const response = await getMyTicketById(id);
            if (response.success && response.data) setSelectedTicket(response.data);
        } catch (err) {
            showToast('Failed to load ticket', 'error');
        }
    };

    const uploadFiles = async (files: File[]) =>
        files.length ? (await uploadDocuments(files)).map((u) => u.secureUrl) : [];

    const handleCreate = async () => {
        if (!subject.trim() || !description.trim()) {
            showToast('Subject and description are required', 'error');
            return;
        }
        try {
            setCreating(true);
            const attachments = await uploadFiles(createFiles);
            const response = await createTicket({ category, priority, subject, description, attachments });
            if (response.success) {
                showToast('Support ticket raised', 'success');
                setIsCreateOpen(false);
                setSubject('');
                setDescription('');
                setCategory('Other');
                setPriority('Medium');
                setCreateFiles([]);
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
        if (!selectedTicket || (!replyText.trim() && replyFiles.length === 0)) return;
        try {
            setSending(true);
            const attachments = await uploadFiles(replyFiles);
            const response = await replyToTicket(selectedTicket._id, replyText.trim(), attachments);
            if (response.success && response.data) {
                setSelectedTicket(response.data);
                setReplyText('');
                setReplyFiles([]);
                fetchTickets();
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to send reply', 'error');
        } finally {
            setSending(false);
        }
    };

    const handleClose = async () => {
        if (!selectedTicket) return;
        try {
            setSending(true);
            const response = await closeTicket(selectedTicket._id);
            if (response.success && response.data) {
                setSelectedTicket(response.data);
                showToast('Ticket closed', 'success');
                fetchTickets();
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to close ticket', 'error');
        } finally {
            setSending(false);
        }
    };

    const statusBadge = (status: SupportTicket['status']) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_STYLES[status]}`}>
            {ticketStatusLabel(status)}
        </span>
    );

    const fileInputCls =
        'text-sm text-neutral-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:text-neutral-700 file:text-xs file:font-medium hover:file:bg-neutral-200 file:cursor-pointer cursor-pointer';

    if (selectedTicket) {
        return (
            <div className="flex flex-col h-full">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col h-full">
                    <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <button onClick={() => setSelectedTicket(null)} className="text-teal-100 hover:text-white text-xs mb-1">← Back to tickets</button>
                            <h2 className="text-lg font-semibold truncate">{selectedTicket.subject}</h2>
                        </div>
                        {statusBadge(selectedTicket.status)}
                    </div>
                    <div className="px-4 sm:px-6 py-4 border-b border-neutral-200">
                        <TicketTimeline ticket={selectedTicket} />
                    </div>
                    <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                            <p className="text-xs text-neutral-500 mb-1">{selectedTicket.category} · {selectedTicket.priority} priority · Raised {new Date(selectedTicket.createdAt).toLocaleString('en-GB')}</p>
                            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{selectedTicket.description}</p>
                            <AttachmentList urls={selectedTicket.attachments} />
                        </div>
                        {selectedTicket.messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'Seller' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${msg.sender === 'Seller' ? 'bg-teal-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                                    <p className="text-xs opacity-70 mb-1">{msg.sender === 'Seller' ? 'You' : 'Support Team'} · {new Date(msg.createdAt).toLocaleString('en-GB')}</p>
                                    <p className="whitespace-pre-wrap">{msg.message}</p>
                                    <AttachmentList urls={msg.attachments} light={msg.sender === 'Seller'} />
                                </div>
                            </div>
                        ))}
                    </div>
                    {selectedTicket.status === 'Resolved' && (
                        <div className="mx-4 mb-2 p-3 bg-green-50 border border-green-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-sm text-green-800">Support has marked this resolved. Is your issue fixed?</p>
                            <button
                                onClick={handleClose}
                                disabled={sending}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                            >
                                Yes, close ticket
                            </button>
                        </div>
                    )}
                    {selectedTicket.status !== 'Closed' ? (
                        <div className="p-4 border-t border-neutral-200 space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                                    placeholder={selectedTicket.status === 'Resolved' ? 'Still facing the issue? Reply to reopen...' : 'Type your reply...'}
                                    className="flex-1 min-w-0 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                                <button
                                    onClick={handleReply}
                                    disabled={sending || (!replyText.trim() && replyFiles.length === 0)}
                                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                >
                                    {sending ? '...' : 'Send'}
                                </button>
                            </div>
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                onChange={(e) => setReplyFiles(Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS))}
                                className={fileInputCls}
                            />
                        </div>
                    ) : (
                        <div className="p-4 border-t border-neutral-200 text-center text-xs text-neutral-500">
                            This ticket is closed. Raise a new ticket if you need more help.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-lg font-semibold">Support Tickets</h2>
                        <p className="text-sm text-teal-100 mt-1">Need help? Raise a ticket and chat with our support team.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 rounded-lg text-sm bg-white text-neutral-800"
                        >
                            <option value="">All Tickets</option>
                            <option value="Open">Ticket Created</option>
                            <option value="Assigned">With Support Team</option>
                            <option value="In Progress">Under Investigation</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                        </select>
                        <button
                            onClick={() => setIsCreateOpen(true)}
                            className="bg-white text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            + Raise Ticket
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-neutral-500">Loading tickets...</div>
                ) : tickets.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">
                        <p>No support tickets {statusFilter ? 'with this status' : 'yet'}.</p>
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
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-neutral-800 truncate">{ticket.subject}</p>
                                    <p className="text-xs text-neutral-500 mt-0.5">{ticket.category} · {ticket.priority} priority · {ticket.messages.length} message(s)</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="text-xs text-neutral-400 hidden sm:inline">{new Date(ticket.updatedAt).toLocaleDateString('en-GB')}</span>
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
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">
                                    Attachments <span className="text-xs text-neutral-400">(screenshots or PDF, max {MAX_ATTACHMENTS})</span>
                                </label>
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    multiple
                                    onChange={(e) => setCreateFiles(Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS))}
                                    className={fileInputCls}
                                />
                                {createFiles.length > 0 && <p className="text-xs text-neutral-500 mt-1">{createFiles.length} file(s) selected</p>}
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
