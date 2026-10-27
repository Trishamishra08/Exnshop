import { SupportTicket, TICKET_FLOW } from '../services/api/supportTicketService';

export default function TicketTimeline({ ticket }: { ticket: SupportTicket }) {
    const currentIdx = TICKET_FLOW.findIndex((s) => s.status === ticket.status);
    const reachedAt = (status: string) => {
        const entries = (ticket.statusHistory || []).filter((h) => h.status === status);
        if (entries.length) return entries[entries.length - 1].at;
        return status === 'Open' ? ticket.createdAt : undefined;
    };

    return (
        <ol className="flex items-start w-full">
            {TICKET_FLOW.map((step, idx) => {
                const done = idx <= currentIdx;
                const at = done ? reachedAt(step.status) : undefined;
                return (
                    <li key={step.status} className="flex-1 flex flex-col items-center text-center relative">
                        {idx > 0 && (
                            <span className={`absolute top-3 right-1/2 w-full h-0.5 ${idx <= currentIdx ? 'bg-teal-500' : 'bg-neutral-200'}`} />
                        )}
                        <span
                            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                                done ? 'bg-teal-600 text-white' : 'bg-neutral-200 text-neutral-500'
                            } ${idx === currentIdx ? 'ring-4 ring-teal-100' : ''}`}
                        >
                            {done ? '✓' : idx + 1}
                        </span>
                        <span className={`mt-1.5 text-[11px] leading-tight px-1 ${done ? 'text-neutral-800 font-semibold' : 'text-neutral-400'}`}>
                            {step.label}
                        </span>
                        {at && (
                            <span className="text-[10px] text-neutral-400 mt-0.5">
                                {new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
