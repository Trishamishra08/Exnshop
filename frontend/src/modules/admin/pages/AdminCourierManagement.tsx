import { useState, useEffect } from 'react';
import {
    getCouriers,
    createCourier,
    updateCourier,
    deleteCourier,
    Courier,
    CourierFormData,
} from '../../../services/api/admin/adminCourierService';
import { useToast } from '../../../context/ToastContext';
import { ConfirmationModal } from '../../../components/ConfirmationModal';

const emptyForm: CourierFormData = {
    name: '',
    serviceablePinCodes: [],
    weightLimitKg: 20,
    baseShippingCharge: 0,
    perKgCharge: 0,
    codAvailable: true,
    pickupAvailable: true,
    trackingApiUrl: '',
    trackingApiKey: '',
    deliverySlaDays: 3,
    rtoCharges: 0,
    isActive: true,
};

export default function AdminCourierManagement() {
    const { showToast } = useToast();
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<CourierFormData>(emptyForm);
    const [pinCodesInput, setPinCodesInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const fetchCouriers = async () => {
        try {
            setLoading(true);
            const response = await getCouriers();
            if (response.success && response.data) setCouriers(response.data);
        } catch (err) {
            showToast('Failed to load couriers', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCouriers();
    }, []);

    const openCreateModal = () => {
        setEditingId(null);
        setForm(emptyForm);
        setPinCodesInput('');
        setIsModalOpen(true);
    };

    const openEditModal = (courier: Courier) => {
        setEditingId(courier._id);
        setForm({
            name: courier.name,
            serviceablePinCodes: courier.serviceablePinCodes,
            weightLimitKg: courier.weightLimitKg,
            baseShippingCharge: courier.baseShippingCharge,
            perKgCharge: courier.perKgCharge,
            codAvailable: courier.codAvailable,
            pickupAvailable: courier.pickupAvailable,
            trackingApiUrl: courier.trackingApiUrl || '',
            trackingApiKey: courier.trackingApiKey || '',
            deliverySlaDays: courier.deliverySlaDays,
            rtoCharges: courier.rtoCharges,
            isActive: courier.isActive,
        });
        setPinCodesInput((courier.serviceablePinCodes || []).join(', '));
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            showToast('Courier name is required', 'error');
            return;
        }
        const payload: CourierFormData = {
            ...form,
            serviceablePinCodes: pinCodesInput
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean),
        };
        try {
            setSaving(true);
            const response = editingId
                ? await updateCourier(editingId, payload)
                : await createCourier(payload);
            if (response.success) {
                showToast(`Courier ${editingId ? 'updated' : 'created'} successfully`, 'success');
                setIsModalOpen(false);
                fetchCouriers();
            } else {
                showToast(response.message || 'Failed to save courier', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to save courier', 'error');
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const response = await deleteCourier(deleteId);
            if (response.success) {
                showToast('Courier deleted', 'success');
                setCouriers((prev) => prev.filter((c) => c._id !== deleteId));
            }
        } catch (err) {
            showToast('Failed to delete courier', 'error');
        } finally {
            setDeleteId(null);
        }
    };

    const toggleActive = async (courier: Courier) => {
        try {
            const response = await updateCourier(courier._id, { isActive: !courier.isActive });
            if (response.success) {
                setCouriers((prev) =>
                    prev.map((c) => (c._id === courier._id ? { ...c, isActive: !c.isActive } : c))
                );
            }
        } catch (err) {
            showToast('Failed to update status', 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Courier / Logistics Management</h2>
                            <p className="text-sm text-teal-100 mt-1">Configure the courier partners available for shipment assignment.</p>
                        </div>
                        <button
                            onClick={openCreateModal}
                            className="bg-white text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            + Add Courier
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading couriers...</div>
                    ) : couriers.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No couriers configured yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-4">Courier</th>
                                        <th className="p-4">Weight Limit</th>
                                        <th className="p-4">Shipping Charge</th>
                                        <th className="p-4">COD</th>
                                        <th className="p-4">Pickup</th>
                                        <th className="p-4">SLA</th>
                                        <th className="p-4">RTO Charges</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {couriers.map((courier) => (
                                        <tr key={courier._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                            <td className="p-4 align-middle">
                                                <div className="font-medium">{courier.name}</div>
                                                <div className="text-xs text-neutral-400">
                                                    {courier.serviceablePinCodes.length > 0
                                                        ? `${courier.serviceablePinCodes.length} PIN codes`
                                                        : 'All PIN codes'}
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle">{courier.weightLimitKg} kg</td>
                                            <td className="p-4 align-middle">₹{courier.baseShippingCharge} + ₹{courier.perKgCharge}/kg</td>
                                            <td className="p-4 align-middle">{courier.codAvailable ? 'Yes' : 'No'}</td>
                                            <td className="p-4 align-middle">{courier.pickupAvailable ? 'Yes' : 'No'}</td>
                                            <td className="p-4 align-middle">{courier.deliverySlaDays} days</td>
                                            <td className="p-4 align-middle">₹{courier.rtoCharges}</td>
                                            <td className="p-4 align-middle">
                                                <button
                                                    onClick={() => toggleActive(courier)}
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${courier.isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'
                                                        }`}
                                                >
                                                    {courier.isActive ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td className="p-4 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openEditModal(courier)}
                                                        className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteId(courier._id)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">{editingId ? 'Edit Courier' : 'Add Courier'}</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Courier Name</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    placeholder="e.g. Delhivery, Shiprocket, BlueDart"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">
                                    Serviceable PIN Codes <span className="text-xs text-neutral-400">(comma separated, blank = everywhere)</span>
                                </label>
                                <input
                                    type="text"
                                    value={pinCodesInput}
                                    onChange={(e) => setPinCodesInput(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    placeholder="110001, 110002, 400001"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Weight Limit (kg)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.weightLimitKg}
                                        onChange={(e) => setForm((prev) => ({ ...prev, weightLimitKg: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Delivery SLA (days)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.deliverySlaDays}
                                        onChange={(e) => setForm((prev) => ({ ...prev, deliverySlaDays: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Base Shipping Charge (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.baseShippingCharge}
                                        onChange={(e) => setForm((prev) => ({ ...prev, baseShippingCharge: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Per Kg Charge (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.perKgCharge}
                                        onChange={(e) => setForm((prev) => ({ ...prev, perKgCharge: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">RTO Charges (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.rtoCharges}
                                        onChange={(e) => setForm((prev) => ({ ...prev, rtoCharges: Number(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Tracking API URL <span className="text-xs text-neutral-400">(optional)</span></label>
                                    <input
                                        type="text"
                                        value={form.trackingApiUrl}
                                        onChange={(e) => setForm((prev) => ({ ...prev, trackingApiUrl: e.target.value }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Tracking API Key <span className="text-xs text-neutral-400">(optional)</span></label>
                                    <input
                                        type="password"
                                        value={form.trackingApiKey}
                                        onChange={(e) => setForm((prev) => ({ ...prev, trackingApiKey: e.target.value }))}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-6 pt-2">
                                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.codAvailable}
                                        onChange={(e) => setForm((prev) => ({ ...prev, codAvailable: e.target.checked }))}
                                        className="w-4 h-4 accent-teal-600"
                                    />
                                    COD Available
                                </label>
                                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.pickupAvailable}
                                        onChange={(e) => setForm((prev) => ({ ...prev, pickupAvailable: e.target.checked }))}
                                        className="w-4 h-4 accent-teal-600"
                                    />
                                    Pickup Available
                                </label>
                                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.isActive}
                                        onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                                        className="w-4 h-4 accent-teal-600"
                                    />
                                    Active
                                </label>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Courier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={!!deleteId}
                onCancel={() => setDeleteId(null)}
                onConfirm={confirmDelete}
                title="Delete Courier"
                message="Are you sure you want to delete this courier? This cannot be undone."
            />
        </div>
    );
}
