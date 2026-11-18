import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    getAllTickets,
    getTicketByIdAdmin,
    replyToTicketAsAdmin,
    escalateTicketAsAdmin,
} from '../../../services/api/admin/adminSupportTicketService';
import { SupportTicket, ticketStatusLabel, TICKET_STATUS_STYLES, ESCALATION_LEVELS, PRIORITY_SLA, timeLeft } from '../../../services/api/supportTicketService';
import { useToast } from '../../../context/ToastContext';
import TicketTimeline from '../../../components/TicketTimeline';
import AttachmentList from '../../../components/AttachmentList';

export default function AdminSupportTickets({ type }: { type?: 'Customer' | 'Seller' } = {}) {
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
            if (response.success && response.data) {
                setTickets(type ? response.data.filter((t) => (t.requesterType || 'Seller') === type) : response.data);
            }
        } catch (err) {
            showToast('Failed to load tickets', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, type]);

    const openTicket = async (id: string) => {
        try {
            const response = await getTicketByIdAdmin(id);
            if (response.success && response.data) setSelectedTicket(response.data);
        } catch (err) {
            showToast('Failed to load ticket', 'error');
        }
    };

    // Seller tickets show the store, customer tickets the customer (tagged).
    const getSellerLabel = (ticket: SupportTicket) => {
        if (ticket.requesterType === 'Customer') {
            const c = ticket.customer;
            const name = (typeof c === 'object' && c?.name) || ticket.requesterName || 'Customer';
            return `Customer: ${name}`;
        }
        const seller = ticket.seller;
        if (typeof seller === 'string') return seller;
        return seller?.storeName || seller?.sellerName || '—';
    };

    // Link to the read-only account view (orders, statement, wallet) of whoever raised the ticket.
    const accountLink = (ticket: SupportTicket) => {
        if (ticket.requesterType === 'Customer') {
            const c: any = ticket.customer;
            const id = typeof c === 'object' ? c?._id : c;
            return id ? { to: `/admin/customers/${id}/account`, label: 'View customer account' } : null;
        }
        const sl: any = ticket.seller;
        const id = typeof sl === 'object' ? sl?._id : sl;
        return id ? { to: `/admin/sellers/${id}/account`, label: 'View seller account' } : null;
    };

    const handleEscalate = async () => {
        if (!selectedTicket) return;
        const reason = window.prompt('Reason for escalating this ticket? (optional)') ?? null;
        if (reason === null) return;
        try {
            setSending(true);
            const response = await escalateTicketAsAdmin(selectedTicket._id, reason);
            if (response.success && response.data) {
                showToast(response.message || 'Escalated', 'success');
                openTicket(selectedTicket._id);
                fetchTickets();
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Could not escalate', 'error');
        } finally {
            setSending(false);
        }
    };

    const handlePriority = async (priority: string) => {
        if (!selectedTicket) return;
        try {
            const response = await replyToTicketAsAdmin(selectedTicket._id, '', undefined, priority);
            if (response.success) { openTicket(selectedTicket._id); fetchTickets(); }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Could not change priority', 'error');
        }
    };

    const levelBadge = (t: SupportTicket) =>
        (t.escalationLevel || 0) > 0 && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800">
                L{t.escalationLevel} · {ESCALATION_LEVELS[t.escalationLevel || 0].name}
            </span>
        );

    const slaBadge = (t: SupportTicket) => {
        if (t.status === 'Resolved' || t.status === 'Closed') return null;
        if (t.status === 'Waiting') return <span className="text-[11px] text-purple-600">SLA paused</span>;
        const left = timeLeft(t.levelDueAt);
        return <span className={`text-[11px] font-semibold ${left.overdue ? 'text-red-600' : 'text-neutral-500'}`}>{left.text}</span>;
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

    const statusBadge = (status: SupportTicket['status']) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_STYLES[status]}`}>
            {ticketStatusLabel(status)}
        </span>
    );

    const stageButtons: { status: SupportTicket['status']; label: string; cls: string }[] = [
        { status: 'Assigned', label: 'Assign to Support Team', cls: 'border-indigo-400 text-indigo-700 hover:bg-indigo-50' },
        { status: 'In Progress', label: 'Start Investigation', cls: 'border-amber-400 text-amber-700 hover:bg-amber-50' },
        { status: 'Waiting', label: 'Ask for More Information', cls: 'border-purple-400 text-purple-700 hover:bg-purple-50' },
        { status: 'Resolved', label: 'Mark Resolved', cls: 'border-green-500 text-green-700 hover:bg-green-50' },
        { status: 'Closed', label: 'Close Ticket', cls: 'border-neutral-400 text-neutral-700 hover:bg-neutral-50' },
    ];

    if (selectedTicket) {
        return (
            <div className="flex flex-col h-full bg-gray-50 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col flex-1">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                        <div>
                            <button onClick={() => setSelectedTicket(null)} className="text-teal-100 hover:text-white text-xs mb-1">← Back to tickets</button>
                            <h2 className="text-lg font-semibold">{selectedTicket.subject}</h2>
                            {selectedTicket.ticketNumber && <p className="text-xs text-teal-100 font-mono">{selectedTicket.ticketNumber}</p>}
                            <p className="text-sm text-teal-100 mt-1">{getSellerLabel(selectedTicket)} · {selectedTicket.category} · {selectedTicket.priority} priority</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            {statusBadge(selectedTicket.status)}
                            {accountLink(selectedTicket) && (
                                <Link to={accountLink(selectedTicket)!.to} className="px-3 py-1 bg-white text-teal-700 rounded text-xs font-semibold hover:bg-teal-50">
                                    {accountLink(selectedTicket)!.label} →
                                </Link>
                            )}
                        </div>
                    </div>
                    <div className="px-6 py-4 border-b border-neutral-200">
                        <TicketTimeline ticket={selectedTicket} />
                    </div>
                    <div className="px-6 py-3 border-b border-neutral-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm bg-neutral-50">
                        <div className="flex items-center gap-2">
                            <span className="text-neutral-500">Priority</span>
                            <select value={selectedTicket.priority} onChange={(e) => handlePriority(e.target.value)} className="border border-neutral-300 rounded px-2 py-1 text-xs bg-white">
                                {Object.entries(PRIORITY_SLA).map(([p, sla]) => <option key={p} value={p}>{p} ({sla})</option>)}
                            </select>
                        </div>
                        <div><span className="text-neutral-500">SLA </span>{slaBadge(selectedTicket) || <span className="text-xs text-green-700 font-semibold">Done</span>}{selectedTicket.slaBreached && <span className="ml-2 text-[11px] text-red-600 font-semibold">breached</span>}</div>
                        <div className="flex items-center gap-2">
                            <span className="text-neutral-500">Level</span>
                            <span className="text-xs font-semibold">{ESCALATION_LEVELS[selectedTicket.escalationLevel || 0].name}</span>
                            {(selectedTicket.escalationLevel || 0) < 3 && selectedTicket.status !== 'Closed' && (
                                <button onClick={handleEscalate} disabled={sending} className="px-2 py-1 border border-orange-400 text-orange-700 rounded text-xs font-medium hover:bg-orange-50 disabled:opacity-50">Escalate ↑</button>
                            )}
                        </div>
                        {selectedTicket.rating && (
                            <div className="text-xs"><span className="text-neutral-500">Customer rating </span><b className="text-amber-600">{'★'.repeat(selectedTicket.rating.stars)}{'☆'.repeat(5 - selectedTicket.rating.stars)}</b>{selectedTicket.rating.feedback ? ` — "${selectedTicket.rating.feedback}"` : ''}</div>
                        )}
                        {(selectedTicket.escalationHistory || []).length > 0 && (
                            <div className="w-full text-[11px] text-neutral-500">
                                {(selectedTicket.escalationHistory || []).map((h, i) => (
                                    <span key={i} className="mr-3">↑ {ESCALATION_LEVELS[h.level].name} ({h.by}{h.reason ? `: ${h.reason}` : ''}) {new Date(h.at).toLocaleString('en-GB')}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{selectedTicket.description}</p>
                            <AttachmentList urls={selectedTicket.attachments} />
                        </div>
                        {selectedTicket.messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'Admin' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${msg.sender === 'Admin' ? 'bg-teal-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                                    <p className="text-xs opacity-70 mb-1">{msg.sender === 'Admin' ? 'You (Support)' : getSellerLabel(selectedTicket)} · {new Date(msg.createdAt).toLocaleString('en-GB')}</p>
                                    <p className="whitespace-pre-wrap">{msg.message}</p>
                                    <AttachmentList urls={msg.attachments} light={msg.sender === 'Admin'} />
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
                        <div className="flex gap-2 flex-wrap">
                            {stageButtons
                                .filter((b) => b.status !== selectedTicket.status)
                                .map((b) => (
                                    <button
                                        key={b.status}
                                        onClick={() => handleReply(b.status)}
                                        disabled={sending}
                                        className={`px-3 py-1.5 border rounded text-xs font-medium disabled:opacity-50 ${b.cls}`}
                                    >
                                        {b.label}
                                    </button>
                                ))}
                        </div>
                        <p className="text-[11px] text-neutral-400">A reply moves a new ticket to "With Support Team" automatically. A status change sent with a reply applies both.</p>
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
                            <h2 className="text-lg font-semibold">{type ? `${type} Support` : 'Support Tickets'}</h2>
                            <p className="text-sm text-teal-100 mt-1">{type === 'Customer' ? 'Customers raise tickets here; you reply and resolve them. Customers never contact sellers directly.' : type === 'Seller' ? 'Sellers raise tickets here; you reply and resolve them.' : 'Respond to seller and customer support requests.'}</p>
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800"
                        >
                            <option value="">All Statuses</option>
                            <option value="Open">Ticket Created</option>
                            <option value="Assigned">With Support Team</option>
                            <option value="In Progress">Under Investigation</option>
                            <option value="Waiting">Waiting for reply</option>
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
                                        <p className="text-sm font-medium text-neutral-800">{ticket.ticketNumber && <span className="font-mono text-[11px] text-neutral-400 mr-2">{ticket.ticketNumber}</span>}{ticket.subject}</p>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            {getSellerLabel(ticket)} · {ticket.category} · {ticket.priority} priority · {ticket.messages.length} message(s)
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        {slaBadge(ticket)}
                                        {levelBadge(ticket)}
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
