import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import TicketTimeline from '../../../components/TicketTimeline';
import { appealMyTicket, getMyTicket, rateMyTicket, replyToMyTicket } from '../../../services/api/customerTicketService';
import { ESCALATION_LEVELS, PRIORITY_SLA, SupportTicket, ticketStatusLabel, TICKET_STATUS_STYLES, timeLeft } from '../../../services/api/supportTicketService';

const APPEAL_DAYS = 7;
const card = 'bg-white rounded-xl border border-gray-200 p-4';

/**
 * Track Ticket: live status, resolution deadline (SLA), escalation level, the conversation with
 * support, and — once resolved — rating (which closes the ticket) or an appeal.
 */
export default function TrackTicket() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getMyTicket(id);
      if (res.data) setTicket(res.data);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load this ticket', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  // Live status: refresh every 30s and keep the countdown ticking.
  useEffect(() => {
    load();
    const t = setInterval(() => { load(); setNow(Date.now()); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<any>, ok: string, after?: () => void) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.data) setTicket(res.data);
      showToast(res?.message || ok, 'success');
      after?.();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;
  if (!ticket) return <div className="p-8 text-center text-sm text-gray-500">Ticket not found.</div>;

  const level = ticket.escalationLevel || 0;
  const finished = ticket.status === 'Resolved' || ticket.status === 'Closed';
  const left = timeLeft(ticket.levelDueAt, now);
  const doneAt = ticket.closedAt || ticket.resolvedAt;
  const canAppeal = finished
    ? !!doneAt && now - new Date(doneAt).getTime() <= APPEAL_DAYS * 86400000
    : ticket.status !== 'Waiting' && left.overdue && level < 3;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3.5 flex items-center gap-3 max-w-xl mx-auto">
          <button onClick={() => navigate('/account/support-tickets')} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono text-gray-400">{ticket.ticketNumber}</p>
            <h1 className="text-base font-bold text-gray-900 truncate">{ticket.subject}</h1>
          </div>
          <span className={`shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${TICKET_STATUS_STYLES[ticket.status]}`}>{ticketStatusLabel(ticket.status)}</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Progress */}
        <div className={card}><TicketTimeline ticket={ticket} /></div>

        {ticket.status === 'Waiting' && (
          <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs text-purple-900">
            <b>Our team needs more information.</b> Please reply below — the timer is paused until you do.
          </div>
        )}

        {/* SLA + escalation */}
        <div className={`${card} space-y-3`}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Resolution target</span>
            <b className="text-gray-900">{ticket.priority} · {PRIORITY_SLA[ticket.priority]}</b>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{finished ? (ticket.status === 'Closed' ? 'Closed' : 'Resolved') : 'Time left'}</span>
            {finished
              ? <b className="text-emerald-700">{doneAt ? new Date(doneAt).toLocaleString('en-GB') : '—'}</b>
              : ticket.status === 'Waiting'
                ? <b className="text-purple-700">Paused</b>
                : <b className={left.overdue ? 'text-red-600' : 'text-gray-900'}>{left.text}</b>}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Who is handling it</p>
            <ol className="space-y-1.5">
              {ESCALATION_LEVELS.map((l) => (
                <li key={l.level} className={`flex items-center gap-2 text-sm ${l.level === level ? 'font-bold text-gray-900' : l.level < level ? 'text-gray-500' : 'text-gray-300'}`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${l.level === level ? 'bg-emerald-600 text-white' : l.level < level ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{l.level < level ? '✓' : l.level + 1}</span>
                  {l.name} <span className="text-[11px] font-normal">· {l.note}</span>
                </li>
              ))}
            </ol>
          </div>

          {canAppeal && !appealOpen && (
            <button onClick={() => setAppealOpen(true)} className="w-full py-2 rounded-lg border border-orange-400 text-orange-700 text-sm font-semibold">
              {finished ? 'Not satisfied? Reopen & escalate' : 'Taking too long? Escalate'}
            </button>
          )}
          {appealOpen && (
            <div className="space-y-2">
              <textarea value={appealReason} onChange={(e) => setAppealReason(e.target.value)} rows={3} maxLength={300} placeholder="What is still wrong?"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="flex gap-2">
                <button onClick={() => setAppealOpen(false)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700">Cancel</button>
                <button disabled={busy || appealReason.trim().length < 5}
                  onClick={() => run(() => appealMyTicket(ticket._id, appealReason.trim()), 'Escalated', () => { setAppealOpen(false); setAppealReason(''); })}
                  className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold disabled:opacity-50">Escalate</button>
              </div>
            </div>
          )}
        </div>

        {/* Conversation */}
        <div className={`${card} space-y-3`}>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-[11px] text-gray-400 mb-1">You · {new Date(ticket.createdAt).toLocaleString('en-GB')}</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{ticket.description}</p>
          </div>
          {ticket.messages.map((m, i) => (
            <div key={i} className={`flex ${m.sender === 'Customer' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.sender === 'Customer' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                <p className="text-[11px] opacity-70 mb-0.5">{m.sender === 'Customer' ? 'You' : 'Exnshop Support'} · {new Date(m.createdAt).toLocaleString('en-GB')}</p>
                <p className="whitespace-pre-wrap">{m.message}</p>
              </div>
            </div>
          ))}

          {ticket.status !== 'Closed' && (
            <div className="flex gap-2 pt-1">
              <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder={ticket.status === 'Waiting' ? 'Write the information requested…' : 'Add a message…'}
                onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim().length >= 2 && !busy) run(() => replyToMyTicket(ticket._id, reply.trim()), 'Reply sent', () => setReply('')); }}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button disabled={busy || reply.trim().length < 2} onClick={() => run(() => replyToMyTicket(ticket._id, reply.trim()), 'Reply sent', () => setReply(''))}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">Send</button>
            </div>
          )}
        </div>

        {/* Rating */}
        {ticket.status === 'Resolved' && !ticket.rating && (
          <div className={`${card} space-y-3`}>
            <p className="text-sm font-bold text-gray-900">How was your experience?</p>
            <p className="text-xs text-gray-500 -mt-2">Rating closes this ticket. If it is not really fixed, use "Reopen & escalate" above instead.</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`text-3xl leading-none ${n <= stars ? 'text-amber-400' : 'text-gray-300'}`}>★</button>
              ))}
            </div>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={500} placeholder="Tell us more (optional)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button disabled={busy || stars < 1} onClick={() => run(() => rateMyTicket(ticket._id, stars, feedback.trim() || undefined), 'Thanks for your feedback')}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">Submit & close ticket</button>
          </div>
        )}
        {ticket.rating && (
          <div className={`${card} text-center`}>
            <p className="text-xs text-gray-500">Your rating</p>
            <p className="text-2xl text-amber-400">{'★'.repeat(ticket.rating.stars)}<span className="text-gray-300">{'★'.repeat(5 - ticket.rating.stars)}</span></p>
            {ticket.rating.feedback && <p className="text-xs text-gray-600 mt-1">"{ticket.rating.feedback}"</p>}
          </div>
        )}
      </div>
    </div>
  );
}
