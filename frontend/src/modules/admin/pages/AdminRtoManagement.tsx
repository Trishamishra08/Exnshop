import { useState, useEffect } from 'react';
import { getRtoEventsAdmin, updateRtoResolutionAdmin, RTOEvent } from '../../../services/api/admin/adminRtoService';
import { useToast } from '../../../context/ToastContext';

const RESOLUTION_OPTIONS: RTOEvent['status'][] = ['Initiated', 'InTransit', 'ReceivedBySeller', 'Disposed', 'Lost'];

export default function AdminRtoManagement() {
    const { showToast } = useToast();
    const [events, setEvents] = useState<RTOEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('All');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await getRtoEventsAdmin(statusFilter !== 'All' ? { status: statusFilter } : undefined);
            if (response.success && response.data) setEvents(response.data);
        } catch (err) {
            showToast('Failed to load RTO events', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const handleResolutionChange = async (id: string, resolutionStatus: string) => {
        if (resolutionStatus === 'Initiated') return;
        try {
            setUpdatingId(id);
            const response = await updateRtoResolutionAdmin(
                id,
                resolutionStatus as 'InTransit' | 'ReceivedBySeller' | 'Disposed' | 'Lost',
            );
            if (response.success) {
                showToast('Resolution updated', 'success');
                fetchEvents();
            }
        } catch (err) {
            showToast('Failed to update resolution', 'error');
        } finally {
            setUpdatingId(null);
        }
    };

    const getOrderLabel = (order: RTOEvent['order']) =>
        typeof order === 'string' ? order : order?.orderNumber || '—';

    const getSellerLabel = (seller: RTOEvent['seller']) =>
        typeof seller === 'string' ? seller : seller?.storeName || seller?.sellerName || '—';

    const statusBadge = (status: RTOEvent['status']) => {
        const styles: Record<RTOEvent['status'], string> = {
            Initiated: 'bg-amber-100 text-amber-800',
            InTransit: 'bg-blue-100 text-blue-800',
            ReceivedBySeller: 'bg-green-100 text-green-800',
            Disposed: 'bg-neutral-200 text-neutral-700',
            Lost: 'bg-red-100 text-red-800',
        };
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">RTO Events</h2>
                            <p className="text-sm text-teal-100 mt-1">Parcels returned by courier before reaching the customer.</p>
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 text-sm rounded-lg text-neutral-800"
                        >
                            <option value="All">All Statuses</option>
                            {RESOLUTION_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading RTO events...</div>
                    ) : events.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No RTO events found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-4">Order</th>
                                        <th className="p-4">Seller</th>
                                        <th className="p-4">Courier</th>
                                        <th className="p-4">Reason</th>
                                        <th className="p-4">Reverse Cost</th>
                                        <th className="p-4">Marked By</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Update Resolution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((event) => (
                                        <tr key={event._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                            <td className="p-4 align-middle font-medium">{getOrderLabel(event.order)}</td>
                                            <td className="p-4 align-middle">{getSellerLabel(event.seller)}</td>
                                            <td className="p-4 align-middle">{event.courierName || '—'}</td>
                                            <td className="p-4 align-middle text-xs">{event.reasonCode}</td>
                                            <td className="p-4 align-middle">₹{event.reverseShippingCost.toFixed(2)}</td>
                                            <td className="p-4 align-middle text-xs">{event.markedByRole}</td>
                                            <td className="p-4 align-middle">{statusBadge(event.status)}</td>
                                            <td className="p-4 align-middle">
                                                <select
                                                    value={event.status}
                                                    disabled={updatingId === event._id || event.status === 'ReceivedBySeller' || event.status === 'Disposed' || event.status === 'Lost'}
                                                    onChange={(e) => handleResolutionChange(event._id, e.target.value)}
                                                    className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                >
                                                    {RESOLUTION_OPTIONS.map((s) => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
