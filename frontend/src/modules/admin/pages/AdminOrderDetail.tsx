import { importWithRetry } from '../../../utils/lazyWithRetry';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrderById, updateOrderStatus, getOrderEarningBreakdown, markOrderCODPaid, Order, type EarningBreakdown } from '../../../services/api/admin/adminOrderService';
import { useToast } from '../../../context/ToastContext';
import DeliverySlipButton from '../../../components/DeliverySlipButton';
import { getAdminShippingLabels } from '../../../services/api/shippingLabelService';
import { getAdminTaxInvoices } from '../../../services/api/taxInvoiceService';
import { formatDeliveryAddress } from '../../../utils/addressUtils';
import { paymentLabel } from '../../../utils/paymentDisplay';

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [earningBreakdown, setEarningBreakdown] = useState<EarningBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);

  // E-commerce: courier label + tax invoice for every seller shipment of the order.
  const handleDownloadLabels = async () => {
    if (!id) return;
    setLabelBusy(true);
    try {
      const res = await getAdminShippingLabels(id);
      if (res.success && res.data.length) {
        const { downloadShippingLabels } = await importWithRetry(() => import('../../../utils/shippingLabelPdf'));
        await downloadShippingLabels(res.data, `Shipping_Labels_${res.data[0].invoice.orderNumber}.pdf`);
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
  // Every seller's GST tax invoice for the order (Quick or E-commerce).
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const handleDownloadInvoices = async () => {
    if (!id) return;
    setInvoiceBusy(true);
    try {
      const res = await getAdminTaxInvoices(id);
      if (res.success && res.data.length) {
        const { downloadTaxInvoices } = await importWithRetry(() => import('../../../utils/taxInvoicePdf'));
        await downloadTaxInvoices(res.data, `Invoice_${res.data[0].orderNumber}.pdf`);
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
  const [markingCodPaid, setMarkingCodPaid] = useState(false);

  // Fetch order detail from API
  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!id) return;

      setLoading(true);
      setError('');
      try {
        const response = await getOrderById(id);
        if (response.success && response.data) {
          setOrder(response.data);
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

  // Fetch earning breakdown for any order (COD or Online): admin/seller/delivery split
  useEffect(() => {
    const fetchEarningBreakdown = async () => {
      if (!id || !order) return;
      try {
        const res = await getOrderEarningBreakdown(id);
        if (res.success && res.data) setEarningBreakdown(res.data);
      } catch {
        setEarningBreakdown(null);
      }
    };
    fetchEarningBreakdown();
  }, [id, order]);

  const handleMarkCodPaid = async () => {
    if (!id || !order || order.paymentMethod !== 'COD') return;
    setMarkingCodPaid(true);
    try {
      const res = await markOrderCODPaid(id);
      if (res.success && res.data) {
        setOrder({ ...order, codPaidToAdminAt: res.data.codPaidToAdminAt, paymentStatus: (res.data.paymentStatus || 'Paid') as any });
        showToast('COD marked as received. Payment status is now Paid.', 'success');
      } else {
        showToast(res.message || 'Failed to mark COD as paid', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark COD as paid', 'error');
    } finally {
      setMarkingCodPaid(false);
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    setUpdating(true);
    try {
      const response = await updateOrderStatus(order._id, { status: newStatus });
      if (response.success && response.data) {
        setOrder(response.data);
        showToast('Order status updated successfully', 'success');
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-neutral-500">Loading order details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/admin/orders/all')}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Order Not Found</h2>
          <button
            onClick={() => navigate('/admin/orders/all')}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const customer = typeof order.customer === 'object' ? order.customer : null;
  const deliveryBoy = typeof order.deliveryBoy === 'object' ? order.deliveryBoy : null;
  const items = Array.isArray(order.items) ? order.items : [];

  const statusOptions = [
    'Received',
    'Pending',
    'Processed',
    'Shipped',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
    'Rejected',
    'Returned',
  ];

  // COD the seller collected themselves: Quick self delivery, or an E-commerce parcel the seller shipped with their own courier.
  const sellerCollectedCod =
    (order as any)?.paymentMethod === 'COD' &&
    ((order as any)?.sellerFulfilled ??
      (((order as any)?.channel !== 'ECommerce' && (order as any)?.deliveryPreference === 'Self' && !(order as any)?.deliveryBoy) ||
        ((order as any)?.channel === 'ECommerce' && ((order as any)?.shiprocketShipments || []).some((x: any) => x?.provider === 'Self'))));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/orders/all')}
          className="text-teal-600 hover:text-teal-700 mb-4 flex items-center gap-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Orders
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Order Details</h1>
            <p className="text-neutral-600 mt-1">Order #{order.orderNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadInvoices}
              disabled={invoiceBusy}
              className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {invoiceBusy ? 'Please wait…' : 'Download Tax Invoice'}
            </button>
            {!['Cancelled', 'Rejected'].includes(order.status) && (
              <DeliverySlipButton
                as="admin"
                orderId={order._id}
                orderRef={order.orderNumber}
                className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              />
            )}
            {order.channel === 'ECommerce' && (
              <button
                onClick={handleDownloadLabels}
                disabled={labelBusy}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {labelBusy ? 'Please wait…' : 'Download Shipping Label'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order Status</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Current Status
              </label>
              {/* Seller delivers / ships it themselves: only the seller moves its status. */}
              {(order as any).sellerFulfilled ? (
                <div>
                  <div className="w-full px-3 py-2 border border-neutral-200 bg-neutral-50 rounded-md font-medium text-neutral-900">
                    {order.status}
                  </div>
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    The seller delivers this order themselves (self delivery / self shipping), so only the seller updates its
                    status{order.paymentMethod === 'COD' ? ' and its cash payment' : ''}.
                  </p>
                </div>
              ) : (
              <select
                value={order.status}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                disabled={updating}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {statusOptions.map((status) => {
                  // A delivered order can no longer be cancelled or rejected.
                  const locked = order.status === 'Delivered' && (status === 'Cancelled' || status === 'Rejected');
                  return (
                    <option key={status} value={status} disabled={locked}>
                      {status}
                      {locked ? ' (not allowed after delivery)' : ''}
                    </option>
                  );
                })}
              </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-neutral-600">Order Date:</span>
                <span className="ml-2 font-medium">{formatDate(order.orderDate)}</span>
              </div>
              <div>
                <span className="text-neutral-600">Payment Status:</span>
                <span className="ml-2 font-medium">{paymentLabel(order as any)}</span>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Product</th>
                    <th className="text-right py-2 px-2">Price</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, index: number) => {
                    const product = typeof item.product === 'object' ? item.product : null;
                    const seller = typeof item.seller === 'object' ? item.seller : null;
                    return (
                      <tr key={item._id || index} className="border-b">
                        <td className="py-3 px-2">
                          <div>
                            <div className="font-medium">{item.productName || product?.productName || 'N/A'}</div>
                            {seller && (
                              <div className="text-sm text-neutral-500">
                                Seller: {seller.storeName || seller.sellerName}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">₹{item.unitPrice?.toFixed(2) || '0.00'}</td>
                        <td className="text-right py-3 px-2">{item.quantity || 0}</td>
                        <td className="text-right py-3 px-2 font-medium">
                          ₹{item.total?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Delivery Address</h2>
            <div className="text-neutral-700 space-y-1">
              <p className="font-bold text-neutral-900">{order.customerName}</p>
              <p className="text-sm font-medium">{formatDeliveryAddress(order.deliveryAddress).formatted}</p>
              {order.deliveryAddress?.landmark && (
                <p className="text-xs text-neutral-500">Landmark: {order.deliveryAddress.landmark}</p>
              )}
              {formatDeliveryAddress(order.deliveryAddress).mapsUrl && (
                <div className="pt-2">
                  <a
                    href={formatDeliveryAddress(order.deliveryAddress).mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 text-white rounded text-xs font-medium hover:bg-teal-700 transition-colors"
                  >
                    <span>Open in Maps</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-neutral-600">Name:</span>
                <span className="ml-2 font-medium">{order.customerName}</span>
              </div>
              <div>
                <span className="text-neutral-600">Email:</span>
                <span className="ml-2 font-medium">{order.customerEmail}</span>
              </div>
              <div>
                <span className="text-neutral-600">Phone:</span>
                <span className="ml-2 font-medium">{order.customerPhone}</span>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">Subtotal:</span>
                <span className="font-medium">₹{order.subtotal?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Tax:</span>
                <span className="font-medium">₹{order.tax?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Shipping:</span>
                <span className="font-medium">₹{order.shipping?.toFixed(2) || '0.00'}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span className="font-medium">-₹{order.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total:</span>
                <span>₹{order.total?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Delivery Information */}
          {(deliveryBoy || order.deliveryPreference === 'Self') && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Delivery Information</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-neutral-600">Delivery Boy:</span>
                  <span className="ml-2 font-medium">
                    {order.deliveryPreference === 'Self' ? 'Self Assigned' : deliveryBoy?.name}
                  </span>
                </div>
                {deliveryBoy?.mobile && order.deliveryPreference !== 'Self' && (
                  <div>
                    <span className="text-neutral-600">Mobile:</span>
                    <span className="ml-2 font-medium">{deliveryBoy.mobile}</span>
                  </div>
                )}
                {order.deliveryBoyStatus && order.deliveryPreference !== 'Self' && (
                  <div>
                    <span className="text-neutral-600">Status:</span>
                    <span className="ml-2 font-medium capitalize">{order.deliveryBoyStatus}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Payment Information</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-neutral-600">Method:</span>
                <span className="ml-2 font-medium">{order.paymentMethod}</span>
              </div>
              <div>
                <span className="text-neutral-600">Status:</span>
                <span className="ml-2 font-medium">{paymentLabel(order as any)}</span>
              </div>
              {order.paymentId && (
                <div>
                  <span className="text-neutral-600">Payment ID:</span>
                  <span className="ml-2 font-medium text-xs">{order.paymentId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Earning breakdown: admin, sellers, delivery (COD and Online) */}
          {earningBreakdown && (
            <div className="bg-white rounded-lg shadow p-6 border border-teal-100 space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 border-b pb-2 flex items-center gap-2">
                <span>💰</span> Order Financial Breakdown
              </h2>

              {/* 1. Customer Paid */}
              <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                <p className="font-semibold text-xs text-neutral-500 uppercase tracking-wider mb-2">Customer Paid</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Product Amount:</span>
                    <span className="font-medium">₹{(order.subtotal || earningBreakdown.productCost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Platform / Handling Fee:</span>
                    <span className="font-medium">₹{(earningBreakdown.platformFee || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Delivery Charge:</span>
                    <span className="font-medium">₹{(earningBreakdown.totalDeliveryCharge || 0).toFixed(2)}</span>
                  </div>
                  {/* Lines that explain the total (it was showing less than the sum above with no reason) */}
                  {Number((order as any).tax || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-600">GST:</span>
                      <span className="font-medium">₹{Number((order as any).tax).toFixed(2)}</span>
                    </div>
                  )}
                  {Number((order as any).tipAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Tip:</span>
                      <span className="font-medium">₹{Number((order as any).tipAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number((order as any).discount || 0) > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Coupon discount{(order as any).couponCode ? ` (${(order as any).couponCode})` : ''}:</span>
                      <span className="font-medium">−₹{Number((order as any).discount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-neutral-300 pt-1.5 mt-1.5 flex justify-between font-semibold text-neutral-900">
                    <span>Total Paid by Customer:</span>
                    <span>₹{(order.total || earningBreakdown.totalOrderAmount || 0).toFixed(2)}</span>
                  </div>
                  {Number((order as any).walletAmountUsed || 0) > 0 && (
                    <p className="text-[11px] text-neutral-500">
                      of which ₹{Number((order as any).walletAmountUsed).toFixed(2)} from the Exnshop wallet
                      {Number((order as any).codAmountPending || 0) > 0 ? `, ₹${Number((order as any).codAmountPending).toFixed(2)} cash on delivery` : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Seller */}
              <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                <p className="font-semibold text-xs text-blue-800 uppercase tracking-wider mb-2">Seller</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Product Sale:</span>
                    <span className="font-medium">₹{(earningBreakdown.productCost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Admin Commission:</span>
                    <span className="font-medium">-₹{(earningBreakdown.adminProductCommission || 0).toFixed(2)}</span>
                  </div>
                  {earningBreakdown.sellerEarningsList?.map((s) => (
                    <div key={s.sellerId} className="flex justify-between pt-1 font-semibold text-blue-900 border-t border-blue-200 mt-1">
                      <span>Seller Net Earning ({s.sellerName || 'Seller'}):</span>
                      <span>₹{(s.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Delivery Partner */}
              <div className="bg-purple-50/60 p-3 rounded-lg border border-purple-200">
                <p className="font-semibold text-xs text-purple-800 uppercase tracking-wider mb-2">Delivery Partner</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Delivery Charge Collected:</span>
                    <span className="font-medium">₹{(earningBreakdown.totalDeliveryCharge || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-purple-700">
                    <span>Delivery Partner Earning (Paid by Admin):</span>
                    <span className="font-medium">
                      {earningBreakdown.isSelfAssign
                        ? '₹0.00 (Self Delivery — goes to seller)'
                        : `-₹${(earningBreakdown.deliveryBoyCommission || 0).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="border-t border-purple-200 pt-1.5 mt-1.5 flex justify-between font-semibold text-purple-950">
                    <span>Delivery Amount Retained by Admin:</span>
                    <span>₹{(earningBreakdown.adminDeliveryCommission || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 4. Admin Net Earning */}
              <div className="bg-teal-50 p-3 rounded-lg border border-teal-200">
                <p className="font-semibold text-xs text-teal-800 uppercase tracking-wider mb-2">Admin Net Earning</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Product Commission:</span>
                    <span className="font-medium">₹{(earningBreakdown.adminProductCommission || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Platform Fee:</span>
                    <span className="font-medium">₹{(earningBreakdown.platformFee || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Delivery Amount Retained:</span>
                    <span className="font-medium">₹{(earningBreakdown.adminDeliveryCommission || 0).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-teal-300 pt-2 mt-2 flex justify-between font-bold text-teal-800 text-base">
                    <span>Admin Net Earning:</span>
                    <span>₹{(earningBreakdown.totalAdminEarning || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-neutral-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-start gap-1.5">
                <span className="shrink-0">ℹ️</span>
                <span>Delivery partner earning is paid from Admin's collected amount. Admin retains net ₹{(earningBreakdown.totalAdminEarning || 0).toFixed(2)}.</span>
              </p>
            </div>
          )}

          {/* COD the seller collected (self delivery / self shipping): no cash comes to the admin;
              the platform's share is debited from the seller's wallet after delivery. */}
          {order.paymentMethod === 'COD' && sellerCollectedCod && (
            <div className="bg-white rounded-lg shadow p-6 border border-teal-100">
              <h2 className="text-lg font-semibold mb-2">COD collected by the seller</h2>
              <p className="text-sm text-neutral-600">
                The seller delivered or shipped this order themselves and takes the customer's cash, so the seller updates its
                payment status (it also turns Paid when they mark the order delivered). The admin commission and platform fee
                are debited from the seller's wallet automatically after delivery.
              </p>
              <p className="text-sm mt-2">
                Payment status:{' '}
                <span className={`font-semibold ${order.paymentStatus === 'Paid' ? 'text-green-700' : 'text-amber-700'}`}>
                  {order.paymentStatus === 'Paid' ? 'Paid (cash received by seller)' : `${order.paymentStatus || 'Pending'} (seller to confirm cash)`}
                </span>
              </p>
            </div>
          )}

          {/* COD: Mark as received so it leaves seller settlement pending list */}
          {order.paymentMethod === 'COD' && !sellerCollectedCod && (
            <div className="bg-white rounded-lg shadow p-6 border border-teal-100">
              <h2 className="text-lg font-semibold mb-2">COD settlement</h2>
              {order.codPaidToAdminAt && order.paymentStatus === 'Paid' ? (
                <p className="text-sm text-green-700">
                  COD received on {new Date(order.codPaidToAdminAt).toLocaleString('en-IN')}. Payment status is Paid and this order no longer appears in seller pending settlement.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-neutral-600">
                    The delivery partner or the courier collects this cash, so the admin updates its payment status. When the cash reaches
                    you, mark it as received: the payment turns Paid and the order leaves the seller’s pending settlement list.
                  </p>
                  <button
                    type="button"
                    onClick={handleMarkCodPaid}
                    disabled={markingCodPaid}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {markingCodPaid ? 'Marking…' : 'Mark COD received'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

