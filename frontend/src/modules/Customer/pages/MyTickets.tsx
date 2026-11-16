import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { listMyTickets } from '../../../services/api/customerTicketService';
import { ESCALATION_LEVELS, SupportTicket, ticketStatusLabel, TICKET_STATUS_STYLES, timeLeft } from '../../../services/api/supportTicketService';

/** "My Support Tickets": every ticket the customer raised, with its status and deadline. */
export default function MyTickets() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyTickets()
      .then((res) => setTickets(res.data || []))
      .catch(() => showToast('Could not load your tickets', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3.5 flex items-center gap-3 max-w-xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900">My Support Tickets</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm font-semibold text-gray-800">No tickets yet</p>
            <p className="text-xs text-gray-500 mt-1">When you contact support from Help, your ticket shows up here so you can track it.</p>
          </div>
        ) : (
          tickets.map((t) => {
            const open = !['Resolved', 'Closed', 'Waiting'].includes(t.status);
            const left = timeLeft(t.levelDueAt);
            return (
              <button key={t._id} onClick={() => navigate(`/account/support-tickets/${t._id}`)} className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-gray-400">{t.ticketNumber}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.subject}</p>
                  </div>
                  <span className={`shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${TICKET_STATUS_STYLES[t.status]}`}>{ticketStatusLabel(t.status)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
                  <span>{t.category} · {new Date(t.createdAt).toLocaleDateString('en-GB')}</span>
                  <span className="flex items-center gap-2">
                    {(t.escalationLevel || 0) > 0 && <span className="text-orange-700 font-semibold">{ESCALATION_LEVELS[t.escalationLevel || 0].name}</span>}
                    {open && <span className={left.overdue ? 'text-red-600 font-semibold' : ''}>{left.text}</span>}
                    {t.status === 'Resolved' && !t.rating && <span className="text-emerald-700 font-semibold">Rate us ★</span>}
                    {t.rating && <span className="text-amber-500">{'★'.repeat(t.rating.stars)}</span>}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
