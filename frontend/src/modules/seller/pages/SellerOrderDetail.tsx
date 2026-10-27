import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrderById, updateOrderStatus, getOrderEarningBreakdown, type OrderDetail, type SellerEarningBreakdown } from '../../../services/api/orderService';
import { useToast } from '../../../context/ToastContext';
import ConfirmationModal from '../../../components/ConfirmationModal';
import { formatDeliveryAddress } from '../../../utils/addressUtils';
import SellerQuickOrderDetail from './SellerQuickOrderDetail';
import { getSellerShippingLabel, generateSellerAwb } from '../../../services/api/shippingLabelService';
import { getSellerTaxInvoice } from '../../../services/api/taxInvoiceService';
import { getShippingMethod, saveSelfShippingDetails } from '../../../services/api/shippingMethodService';

// E-commerce orders are packed by the seller and shipped by courier, so they get
// their own screen. Quick orders keep the original rider-delivery screen.
const STEPS = ['Placed', 'Accepted', 'Packed', 'Shipped', 'Delivered'];
const CLOSED_STATUSES = ['Cancelled', 'Rejected', 'Returned', 'RTO'];
const IN_TRANSIT = ['Shipped', 'Picked up', 'On the way', 'Out For Delivery', 'Out for Delivery'];

const stepIndexFor = (status: string): number => {
  if (status === 'Delivered') return 4;
  if (IN_TRANSIT.includes(status)) return 3;
  if (status === 'Processed') return 2;
  if (status === 'Accepted') return 1;
  return 0;
};

const statusLabel = (status: string) => (status === 'Processed' ? 'Packed' : status);

const statusBadgeClass = (status: string) => {
  if (status === 'Delivered') return 'bg-green-100 text-green-800';
  if (CLOSED_STATUSES.includes(status)) return 'bg-red-100 text-red-700';
  if (['Received', 'Pending'].includes(status)) return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
};

const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      <h2 className="px-4 py-3 border-b border-neutral-100 text-xs font-bold text-neutral-500 uppercase tracking-wider">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-neutral-900 font-medium text-right break-words min-w-0">{children}</span>
    </div>
  );
}

export default function SellerOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [earningBreakdown, setEarningBreakdown] = useState<SellerEarningBreakdown | null>(null);

  const isECommerce = orderDetail?.channel === 'ECommerce';
  const isSelf = isECommerce && orderDetail?.shippingMethod === 'Self';

  // Self-shipping seller: the courier list (admin-managed) and the form fields.
  const [couriers, setCouriers] = useState<string[]>([]);
  const [selCourier, setSelCourier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [trackingLink, setTrackingLink] = useState('');
  const [savingShip, setSavingShip] = useState(false);

  useEffect(() => {
    if (!isSelf) return;
    getShippingMethod()
      .then((s) => setCouriers(s.couriers))
      .catch(() => setCouriers([]));
  }, [isSelf]);

  useEffect(() => {
    const s = orderDetail?.shipment;
    if (s?.provider === 'Self') {
      setSelCourier(s.courierName || '');
      setTrackingNo(s.awbCode || '');
      setTrackingLink(s.trackingUrl || '');
    }
  }, [orderDetail?.shipment?.provider, orderDetail?.shipment?.awbCode]);

  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!id) return;

      setLoading(true);
      setError('');
      try {
        const response = await getOrderById(id);
        if (response.success && response.data) {
          setOrderDetail(response.data);
          setOrderStatus(response.data.status);
        } else {
          setError(response.message || 'Failed to fetch order details');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetail();
  }, [id]);

  // The Quick screen loads its own earning breakdown.
  useEffect(() => {
    if (!id || !isECommerce) return;
    getOrderEarningBreakdown(id)
      .then((res) => res.success && res.data && setEarningBreakdown(res.data))
      .catch(() => setEarningBreakdown(null));
  }, [id, isECommerce]);

  const reloadOrder = async () => {
    if (!id) return;
    const response = await getOrderById(id).catch(() => null);
    if (response?.success && response.data) {
      setOrderDetail(response.data);
      setOrderStatus(response.data.status);
    }
  };

  const [labelBusy, setLabelBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const handleDownloadLabel = async () => {
    if (!orderDetail) return;
    setLabelBusy(true);
    try {
      const res = await getSellerShippingLabel(orderDetail.id);
      if (res.success && res.data.length) {
        const { downloadShippingLabels } = await import('../../../utils/shippingLabelPdf');
        await downloadShippingLabels(res.data, `Shipping_Label_${orderDetail.orderNumber || orderDetail.id}.pdf`);
      } else {
        showToast(res.message || 'Shipping label is not available yet', 'error');
      }
    } catch (err: any) {
      console.error('Shipping label failed', err);
      showToast(err.response?.data?.message || `Could not create the shipping label${err?.message ? `: ${err.message}` : ''}`, 'error');
    } finally {
      setLabelBusy(false);
    }
  };
  const handleGenerateAwb = async () => {
    if (!orderDetail) return;
    setLabelBusy(true);
    try {
      const res = await generateSellerAwb(orderDetail.id);
      showToast(res.message || 'Courier assigned', 'success');
      await reloadOrder();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not assign a courier', 'error');
    } finally {
      setLabelBusy(false);
    }
  };

  const handleSaveShipping = async () => {
    if (!orderDetail) return;
    if (!selCourier) return showToast('Select the courier company', 'error');
    if (!trackingNo.trim()) return showToast('Enter the tracking number', 'error');
    setSavingShip(true);
    try {
      const res = await saveSelfShippingDetails(orderDetail.id, {
        courierName: selCourier,
        trackingNumber: trackingNo.trim(),
        trackingUrl: trackingLink.trim() || undefined,
      });
      showToast(res.message || 'Courier and tracking number saved', 'success');
      await reloadOrder();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not save the shipping details', 'error');
    } finally {
      setSavingShip(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!orderDetail) return;

    setUpdating(true);
    try {
      const response = await updateOrderStatus(orderDetail.id, { status: newStatus as any });
      if (response.success) {
        const serverStatus = response.data?.status || newStatus;
        setOrderStatus(serverStatus);
        setOrderDetail({ ...orderDetail, status: serverStatus });
        if (isSelf && ['Processed', 'Shipped', 'Delivered'].includes(newStatus)) {
          await reloadOrder();
          showToast(response.message || 'Updated', 'success');
        } else if (newStatus === 'Processed') {
          // Packing assigns the courier AWB — reload to show it.
          await reloadOrder();
          showToast(response.message || 'Marked as packed', (response.data as any)?.awbCode ? 'success' : 'error');
        } else {
          showToast(`Order ${newStatus.toLowerCase()}`, 'success');
        }
      } else {
        showToast('Failed to update order status', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update order status', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error || !orderDetail) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-900 mb-2">{error ? 'Could not load this order' : 'Order not found'}</h2>
          {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}
          <button
            onClick={() => navigate('/seller/orders')}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (!isECommerce) return <SellerQuickOrderDetail initialOrder={orderDetail} />;

  const isPending = ['Received', 'Pending'].includes(orderStatus);
  const isClosed = CLOSED_STATUSES.includes(orderStatus);
  const currentStep = stepIndexFor(orderStatus);
  const address = formatDeliveryAddress(orderDetail.deliveryAddress);
  const orderRef = orderDetail.orderNumber || orderDetail.invoiceNumber;

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatUnit = (unit: string) => (!unit || unit === 'N/A' || unit === 'Default' ? '' : unit);

  const handleDownloadInvoice = async () => {
    if (!orderDetail) return;
    setInvoiceBusy(true);
    try {
      const res = await getSellerTaxInvoice(orderDetail.id);
      if (res.success && res.data.length) {
        const { downloadTaxInvoices } = await import('../../../utils/taxInvoicePdf');
        await downloadTaxInvoices(res.data, `Invoice_${orderDetail.orderNumber || orderDetail.id}.pdf`);
      } else {
        showToast(res.message || 'Invoice is not available', 'error');
      }
    } catch (err: any) {
      console.error('Tax invoice failed', err);
      showToast(err.response?.data?.message || `Could not create the invoice${err?.message ? `: ${err.message}` : ''}`, 'error');
    } finally {
      setInvoiceBusy(false);
    }
  };

  const renderAction = () => {
    if (isClosed) {
      return <p className="text-sm text-red-700">This order is {orderStatus.toLowerCase()}. No further action is needed.</p>;
    }
    if (orderStatus === 'Delivered') {
      return <p className="text-sm text-green-700">Delivered to the customer. Nothing more to do.</p>;
    }
    if (isPending && isSelf) {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-neutral-700 flex-1">New E-commerce order. Accept it, pack it, and ship it with your own courier.</p>
          <div className="flex gap-2">
            <button disabled={updating} onClick={() => handleStatusUpdate('Accepted')} className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">Accept order</button>
            <button disabled={updating} onClick={() => setShowRejectModal(true)} className="px-5 py-2 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold disabled:opacity-50">Reject</button>
          </div>
        </div>
      );
    }
    if (isPending) {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-neutral-700 flex-1">New E-commerce order. Accept it to start packing — it will be shipped by courier.</p>
          <div className="flex gap-2">
            <button
              disabled={updating}
              onClick={() => handleStatusUpdate('Accepted')}
              className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              Accept order
            </button>
            <button
              disabled={updating}
              onClick={() => setShowRejectModal(true)}
              className="px-5 py-2 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      );
    }
    if (isSelf) {
      const parcel = orderDetail.shipment?.provider === 'Self' ? orderDetail.shipment : null;
      const parcelStatus = parcel?.status || '';
      const primary = 'px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50';
      if (parcelStatus === 'Delivered') {
        return <p className="text-sm text-green-700">You marked this parcel as delivered.</p>;
      }
      if (parcelStatus === 'Shipped') {
        return (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-neutral-700 flex-1">Parcel is with your courier. When the customer receives it, mark it as delivered.</p>
            <button disabled={updating} onClick={() => handleStatusUpdate('Delivered')} className={primary}>Mark as delivered</button>
          </div>
        );
      }
      if (parcelStatus === 'Packed') {
        return (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-neutral-700 flex-1">Hand the parcel to {parcel?.courierName || 'your courier'}, then mark it as shipped so the customer can track it.</p>
            <button disabled={updating} onClick={() => handleStatusUpdate('Shipped')} className={primary}>Mark as shipped</button>
          </div>
        );
      }
      return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-neutral-700 flex-1">
            You ship your own orders. Book your courier, enter the courier company and tracking number in the Shipping card, then mark the order as packed.
          </p>
          <div className="flex gap-2">
            <button
              disabled={updating || !parcel?.awbCode}
              title={parcel?.awbCode ? '' : 'Save the courier and tracking number first'}
              onClick={() => handleStatusUpdate('Processed')}
              className={primary}
            >
              Mark as packed
            </button>
            <button
              disabled={updating}
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-sm font-semibold disabled:opacity-50"
            >
              Cancel order
            </button>
          </div>
        </div>
      );
    }
    if (orderStatus === 'Accepted') {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-neutral-700 flex-1">
            Pack the items securely, then mark the order as packed. A courier is assigned and the shipping label becomes available to print and stick on the parcel.
          </p>
          <div className="flex gap-2">
            <button
              disabled={updating}
              onClick={() => handleStatusUpdate('Processed')}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              Mark as packed
            </button>
            <button
              disabled={updating}
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-sm font-semibold disabled:opacity-50"
            >
              Cancel order
            </button>
          </div>
        </div>
      );
    }
    return (
      <p className="text-sm text-neutral-700">
        {orderStatus === 'Processed'
          ? orderDetail.shipment?.awbCode
            ? 'Packed. Download the shipping label, stick it on the parcel and hand it to the courier at pickup. Delivery updates come from the courier automatically.'
            : 'Packed, but the courier AWB is not assigned yet. Use "Assign courier & get AWB" in the Shipping card.'
          : 'With the courier. Delivery updates come from the courier automatically.'}
      </p>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 pb-8 space-y-4 print:bg-white">
      {/* Header */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-5">
        <Link to="/seller/orders" className="text-xs font-semibold text-teal-700 hover:underline print:hidden">
          ← All orders
        </Link>
        <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-neutral-900">Order #{orderRef}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(orderStatus)}`}>{statusLabel(orderStatus)}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">E-commerce · Courier</span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Placed {formatDate(orderDetail.orderDate)} at {formatTime(orderDetail.orderDate)}
              {orderDetail.invoiceNumber && orderDetail.invoiceNumber !== orderRef ? ` · Invoice ${orderDetail.invoiceNumber}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {!isSelf && <button
              onClick={handleDownloadLabel}
              disabled={labelBusy || !orderDetail.shipment?.awbCode}
              title={orderDetail.shipment?.awbCode ? 'Courier label + tax invoice (A4)' : 'Available after the order is packed and the courier AWB is assigned'}
              className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {labelBusy ? 'Please wait…' : 'Download Shipping Label'}
            </button>}
            <button
              onClick={handleDownloadInvoice}
              disabled={invoiceBusy}
              className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              {invoiceBusy ? 'Please wait…' : 'Download Tax Invoice'}
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700"
            >
              Print
            </button>
          </div>
        </div>

        {!isClosed && (
          <ol className="mt-5 flex items-start">
            {STEPS.map((label, i) => {
              const done = i <= currentStep;
              return (
                <li key={label} className="flex-1 flex flex-col items-center text-center relative">
                  {i > 0 && <span className={`absolute top-3 right-1/2 w-full h-0.5 ${done ? 'bg-teal-500' : 'bg-neutral-200'}`} />}
                  <span
                    className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      done ? 'bg-teal-600 text-white' : 'bg-white border-2 border-neutral-300 text-neutral-400'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={`mt-1.5 text-[11px] sm:text-xs ${done ? 'text-neutral-900 font-semibold' : 'text-neutral-400'}`}>{label}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Next step */}
      <div
        className={`rounded-xl border p-4 print:hidden ${
          isClosed ? 'bg-red-50 border-red-200' : isPending ? 'bg-amber-50 border-amber-200' : 'bg-teal-50/60 border-teal-200'
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Next step</p>
        {renderAction()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title={`Items (${orderDetail.items.length})`}>
            <ul className="divide-y divide-neutral-100 -my-2">
              {orderDetail.items.map((item) => {
                const unit = formatUnit(item.unit);
                return (
                  <li key={item.srNo} className="py-3 flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-neutral-400 font-bold">{item.product.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 line-clamp-2">{item.product}</p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                        {unit && <span className="text-neutral-700 font-medium">{unit}</span>}
                        {item.sku && <span>SKU {item.sku}</span>}
                        <span>
                          {item.qty} × {money(item.price)}
                        </span>
                        {(item.gst || 0) > 0 && (
                          <span>
                            GST {item.gstPercent}% {money(item.gst || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-neutral-900 shrink-0">{money(item.subtotal)}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{money(orderDetail.subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Tax</span>
                <span>{money(orderDetail.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-neutral-900 text-base pt-1">
                <span>Grand total</span>
                <span>{money(orderDetail.grandTotal)}</span>
              </div>
            </div>
          </Card>

          {earningBreakdown && (
            <Card title="Your earning">
              <InfoRow label="Admin (commission + platform fee)">{money(earningBreakdown.totalAdminEarning ?? 0)}</InfoRow>
              <InfoRow label="Your earning from this order">
                <span className="text-green-700">{money(earningBreakdown.yourEarning ?? 0)}</span>
              </InfoRow>
              {earningBreakdown.note && <p className="text-xs text-neutral-500 mt-2">{earningBreakdown.note}</p>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Customer">
            <p className="text-sm font-semibold text-neutral-900">{orderDetail.customerName || '—'}</p>
            {orderDetail.customerPhone && (
              <a href={`tel:${orderDetail.customerPhone}`} className="block text-sm text-teal-700 font-medium mt-1 hover:underline">
                {orderDetail.customerPhone}
              </a>
            )}
            {orderDetail.customerEmail && <p className="text-xs text-neutral-500 mt-1 break-all">{orderDetail.customerEmail}</p>}
          </Card>

          <Card title="Ship to">
            <p className="text-sm text-neutral-800 leading-relaxed">{address.formatted}</p>
            {address.mapsUrl && (
              <a
                href={address.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-semibold text-teal-700 hover:underline print:hidden"
              >
                Open in Maps ↗
              </a>
            )}
          </Card>

          {isSelf ? (
            <Card title="Shipping (you ship this)">
              {(() => {
                const locked = ['Shipped', 'Delivered'].includes(orderDetail.shipment?.status || '');
                const canEdit = !locked && !isPending && !isClosed && orderStatus !== 'Delivered';
                const field = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 disabled:bg-neutral-100';
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Courier company</label>
                      <select value={selCourier} onChange={(e) => setSelCourier(e.target.value)} disabled={!canEdit} className={field}>
                        <option value="">Select courier</option>
                        {couriers.map((c) => <option key={c} value={c}>{c}</option>)}
                        {selCourier && !couriers.includes(selCourier) && <option value={selCourier}>{selCourier}</option>}
                      </select>
                      {couriers.length === 0 && (
                        <p className="text-[11px] text-amber-700 mt-1">No courier companies are available yet. Ask admin to add them.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Tracking number</label>
                      <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} disabled={!canEdit} maxLength={40} placeholder="e.g. 1234567890" className={field} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Tracking link <span className="font-normal text-neutral-400">(optional)</span></label>
                      <input value={trackingLink} onChange={(e) => setTrackingLink(e.target.value)} disabled={!canEdit} placeholder="https://courier.com/track/…" className={field} />
                    </div>
                    {canEdit ? (
                      <button onClick={handleSaveShipping} disabled={savingShip} className="w-full px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50 print:hidden">
                        {savingShip ? 'Saving…' : orderDetail.shipment?.awbCode ? 'Update tracking details' : 'Save courier & tracking'}
                      </button>
                    ) : (
                      <p className="text-[11px] text-neutral-500">{locked ? 'Details are locked once the parcel is shipped.' : 'Accept the order to add shipping details.'}</p>
                    )}
                    <InfoRow label="Parcel status">{orderDetail.shipment?.provider === 'Self' ? orderDetail.shipment.status : 'Not added yet'}</InfoRow>
                  </div>
                );
              })()}
            </Card>
          ) : (
          <Card title="Shipping (courier)">
            <InfoRow label="Courier">{orderDetail.shipment?.courierName || 'Assigned at pickup'}</InfoRow>
            <InfoRow label="AWB">{orderDetail.shipment?.awbCode || '—'}</InfoRow>
            <InfoRow label="Shipment status">{orderDetail.shipment?.status || 'Not created yet'}</InfoRow>
            {/* Packed but no AWB yet (e.g. Shiprocket was unreachable): let the seller retry. */}
            {!orderDetail.shipment?.awbCode && !isPending && !isClosed && orderStatus !== 'Accepted' && orderStatus !== 'Delivered' && (
              <button
                onClick={handleGenerateAwb}
                disabled={labelBusy}
                className="mt-2 w-full px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50 print:hidden"
              >
                {labelBusy ? 'Please wait…' : 'Assign courier & get AWB'}
              </button>
            )}
            {orderDetail.shipment?.trackingUrl && (
              <a
                href={orderDetail.shipment.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-semibold text-teal-700 hover:underline"
              >
                Track shipment ↗
              </a>
            )}
          </Card>
          )}

          <Card title="Payment">
            <InfoRow label="Method">{orderDetail.paymentMethod}</InfoRow>
            <InfoRow label="Status">
              <span className={orderDetail.paymentStatus === 'Paid' ? 'text-green-700' : 'text-amber-700'}>{orderDetail.paymentStatus}</span>
            </InfoRow>
          </Card>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showRejectModal}
        title="Reject order"
        message="Reject this order? This cannot be undone."
        confirmText="Reject order"
        variant="danger"
        onConfirm={async () => {
          setShowRejectModal(false);
          await handleStatusUpdate('Rejected');
        }}
        onCancel={() => setShowRejectModal(false)}
      />

      <ConfirmationModal
        isOpen={showCancelModal}
        title="Cancel order"
        message="Cancel this order? The customer will be refunded if they have paid. This cannot be undone."
        confirmText="Cancel order"
        variant="danger"
        onConfirm={async () => {
          setShowCancelModal(false);
          await handleStatusUpdate('Cancelled');
        }}
        onCancel={() => setShowCancelModal(false)}
      />
    </div>
  );
}
