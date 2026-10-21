import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrderById, updateOrderStatus, getOrderEarningBreakdown, type OrderDetail, type SellerEarningBreakdown } from '../../../services/api/orderService';
import jsPDF from 'jspdf';
import { useToast } from '../../../context/ToastContext';
import ConfirmationModal from '../../../components/ConfirmationModal';
import { formatDeliveryAddress } from '../../../utils/addressUtils';
import SellerAssignDeliveryBoyModal from '../components/SellerAssignDeliveryBoyModal';

// Quick-commerce order screen. The flow (accept popup, status dropdown, rider
// assignment) is unchanged from the original; only the layout was refreshed.
// E-commerce orders use SellerOrderDetail's courier screen instead.
export default function SellerQuickOrderDetail({ initialOrder }: { initialOrder?: OrderDetail }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [error, setError] = useState<string>('');
  const [orderStatus, setOrderStatus] = useState<string>(initialOrder?.status || 'Out For Delivery');
  const [showAssignPopup, setShowAssignPopup] = useState(false);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [deliveryPreference, setDeliveryPreference] = useState<'Self' | 'Admin'>('Self');
  const [earningBreakdown, setEarningBreakdown] = useState<SellerEarningBreakdown | null>(null);

  // Fetch order detail from API
  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!id || initialOrder) return;

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
  }, [id, initialOrder]);

  // Default delivery preference when assign popup opens: Instant → Auto, Standard → Admin
  useEffect(() => {
    if (showAssignPopup && orderDetail) {
      setDeliveryPreference('Self');
    }
  }, [showAssignPopup, orderDetail?.id]);

  // Fetch earning breakdown (COD or Online): your earning, delivery (Self = you get delivery charge)
  useEffect(() => {
    const fetchEarningBreakdown = async () => {
      if (!id || !orderDetail) return;
      try {
        const res = await getOrderEarningBreakdown(id);
        if (res.success && res.data) setEarningBreakdown(res.data);
      } catch {
        setEarningBreakdown(null);
      }
    };
    fetchEarningBreakdown();
  }, [id, orderDetail]);

  // Handle status update (for Instant, 'Auto' = don't send preference → backend auto-notifies delivery)
  const handleStatusUpdate = async (newStatus: string, pref?: 'Self' | 'Admin' | 'Auto') => {
    if (!orderDetail) return;

    try {
      const payload: any = { status: newStatus as any };
      if (pref && pref !== 'Auto') {
        payload.deliveryPreference = pref;
      }
      const response = await updateOrderStatus(orderDetail.id, payload);
      if (response.success) {
        setOrderStatus(newStatus);
        setOrderDetail({ ...orderDetail, status: newStatus as any });
        showToast(`Order status updated to ${newStatus}`, 'success');
      } else {
        showToast('Failed to update order status', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update order status', 'error');
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
            onClick={() => navigate('/seller/orders')}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (!orderDetail) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Order Not Found</h2>
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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';
    return `${day}${suffix} ${month}, ${year}`;
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleExportPDF = () => {
    if (!orderDetail) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    // Helper function to add a new page if needed
    const checkPageBreak = (requiredHeight: number) => {
      if (yPos + requiredHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Header - Company Info
    doc.setFillColor(22, 163, 74); // Green color
    doc.rect(margin, yPos, contentWidth, 15, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Exnshop', margin + 5, yPos + 10);

    yPos += 20;

    // Company Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Exnshop', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('From: Exnshop', margin, yPos);
    yPos += 6;
    doc.text('Email: support@exnshop.com', margin, yPos);
    yPos += 6;
    doc.text('Website: https://exnshop.com', margin, yPos);
    yPos += 12;

    // Invoice Details (Right aligned)
    const rightX = pageWidth - margin;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${formatDate(orderDetail.orderDate)}`, rightX, yPos - 30, { align: 'right' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Invoice #${orderDetail.invoiceNumber}`, rightX, yPos - 20, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Order ID: ${orderDetail.id}`, rightX, yPos - 14, { align: 'right' });
    doc.text(`Delivery Date: ${formatDate(orderDetail.deliveryDate)}`, rightX, yPos - 8, { align: 'right' });
    doc.text(`Order Time: ${formatTime(orderDetail.orderDate)}`, rightX, yPos - 2, { align: 'right' });

    // Status badge
    const statusWidth = doc.getTextWidth(orderStatus) + 8;
    doc.setFillColor(59, 130, 246); // Blue for status
    doc.roundedRect(rightX - statusWidth, yPos + 2, statusWidth, 6, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(orderStatus, rightX - statusWidth / 2, yPos + 5.5, { align: 'center' });

    yPos += 15;
    doc.setTextColor(0, 0, 0);

    // Draw a line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Table Header
    checkPageBreak(20);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, yPos, contentWidth, 10, 'F');

    const colWidths = [
      contentWidth * 0.08,  // Sr. No.
      contentWidth * 0.40,  // Product
      contentWidth * 0.15,  // Price
      contentWidth * 0.15,  // Tax
      contentWidth * 0.10,  // Qty
      contentWidth * 0.12,  // Subtotal
    ];

    let xPos = margin;
    const headers = ['Sr. No.', 'Product', 'Price', 'Tax ₹ (%)', 'Qty', 'Subtotal'];

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    headers.forEach((header, index) => {
      doc.text(header, xPos + 2, yPos + 7);
      xPos += colWidths[index];
    });

    yPos += 12;

    // Table Rows
    orderDetail.items.forEach((item) => {
      checkPageBreak(15);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      xPos = margin;
      const rowData = [
        item.srNo.toString(),
        item.product,
        `₹${item.price.toFixed(2)}`,
        `${item.tax.toFixed(2)} (${item.taxPercent.toFixed(2)}%)`,
        item.qty.toString(),
        `₹${item.subtotal.toFixed(2)}`,
      ];

      rowData.forEach((data, index) => {
        // Truncate long text
        const maxWidth = colWidths[index] - 4;
        let text = data;
        if (doc.getTextWidth(text) > maxWidth && index === 1) {
          // Truncate product name if too long
          while (doc.getTextWidth(text + '...') > maxWidth && text.length > 0) {
            text = text.slice(0, -1);
          }
          text += '...';
        }
        doc.text(text, xPos + 2, yPos + 5);
        xPos += colWidths[index];
      });

      // Draw row separator
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, yPos + 8, pageWidth - margin, yPos + 8);

      yPos += 10;
    });

    // Calculate totals
    const totalSubtotal = orderDetail.items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTax = orderDetail.items.reduce((sum, item) => sum + item.tax, 0);
    const grandTotal = totalSubtotal + totalTax;

    yPos += 5;
    checkPageBreak(30);

    // Totals Section
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`₹${totalSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 7;

    doc.text('Tax:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`₹${totalTax.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Grand Total:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`₹${grandTotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });

    // Customer Details in PDF
    yPos += 15;
    checkPageBreak(30);
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, yPos, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CUSTOMER DETAILS', margin + 2, yPos + 6);
    yPos += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Name: ${orderDetail.customerName}`, margin, yPos);
    yPos += 5;
    doc.text(`Phone: ${orderDetail.customerPhone}`, margin, yPos);
    yPos += 5;
    const addressInfo = formatDeliveryAddress(orderDetail.deliveryAddress);
    const splitAddress = doc.splitTextToSize(`Address: ${addressInfo.formatted}`, contentWidth);
    doc.text(splitAddress, margin, yPos);
    yPos += (splitAddress.length * 5) + 5;

    // Footer
    checkPageBreak(20);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Bill Generated by Exnshop', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(8);
    doc.text('Copyright © 2025. Developed By Exnshop', pageWidth / 2, yPos, { align: 'center' });

    // Save the PDF
    const fileName = `Invoice_${orderDetail.invoiceNumber}_${orderDetail.id}.pdf`;
    doc.save(fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Accepted':
        return 'bg-blue-100 text-blue-800 border border-blue-400';
      case 'On the way':
        return 'bg-purple-100 text-purple-800 border border-purple-400';
      case 'Delivered':
        return 'bg-green-100 text-green-800 border border-green-400';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border border-red-400';
      case 'Out For Delivery':
        return 'bg-blue-600 text-white border border-blue-700';
      case 'Received':
        return 'bg-blue-50 text-blue-600 border border-blue-200';
      case 'Payment Pending':
        return 'bg-orange-50 text-orange-600 border border-orange-200';
      default:
        return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const formatUnit = (unit: string, qty: number) => {
    if (!unit || unit === 'N/A') return 'N/A';

    // improved regex to handle decimals and various spacing
    const match = unit.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
    if (match) {
      const val = parseFloat(match[1]);
      const u = match[2];
      // check if val is a valid number
      if (!isNaN(val)) {
        const total = val * qty;
        // Format to remove trailing zeros if integer (e.g. 1.0 -> 1)
        return `${parseFloat(total.toFixed(2))}${u}`;
      }
    }
    return `${unit} x ${qty}`;
  };

  const address = formatDeliveryAddress(orderDetail.deliveryAddress);
  const hasRider = Boolean(orderDetail.deliveryBoyName && orderDetail.deliveryBoyName !== 'Self Assign');
  const isFinished = ['Delivered', 'Cancelled', 'Rejected', 'Returned'].includes(orderStatus);
  const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cardCls = 'bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden';
  const cardTitleCls = 'px-4 py-3 border-b border-neutral-100 text-xs font-bold text-neutral-500 uppercase tracking-wider';
  const rowCls = 'flex items-start justify-between gap-3 py-1.5 text-sm';

  return (
    <div className="min-h-screen bg-neutral-50 pb-8 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-5">
        <button onClick={() => navigate('/seller/orders')} className="text-xs font-semibold text-teal-700 hover:underline print:hidden">
          ← All orders
        </button>
        <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-neutral-900">Order #{orderDetail.invoiceNumber}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(orderStatus)}`}>
                {orderStatus}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800">
                Quick{orderDetail.deliveryOption ? ` · ${orderDetail.deliveryOption}` : ''}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Placed {formatDate(orderDetail.orderDate)} at {formatTime(orderDetail.orderDate)}
              {orderStatus === 'Delivered' && ` · Delivered ${formatDate(orderDetail.deliveryDate)}`}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleExportPDF}
              className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700"
            >
              Export Invoice PDF
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700"
            >
              Print Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Order actions (same controls as before) */}
      <div className="bg-white rounded-xl border border-teal-200 shadow-sm p-4 print:hidden">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Order action</p>
        {['Received', 'Pending'].includes(orderStatus) ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-neutral-700 flex-1">New order received. Accept it and choose how the delivery is assigned, or reject it.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAssignPopup(true)}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm"
              >
                Accept Order
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-5 py-2 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold"
              >
                Reject Order
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm text-neutral-700 font-medium shrink-0" htmlFor="order-status">
              Update status
            </label>
            <select
              id="order-status"
              value={orderStatus}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-neutral-50"
              disabled={orderStatus === 'Rejected' || orderStatus === 'Cancelled' || orderStatus === 'Delivered'}
            >
              {orderStatus === 'Accepted' && <option value="Accepted">Accepted</option>}
              <option value="On the way">On the way</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
              {orderStatus === 'Rejected' && <option value="Rejected">Rejected</option>}
            </select>

            {/* Manual Assignment Button for Seller */}
            {(!orderDetail?.deliveryBoyName || orderDetail?.deliveryBoyName === 'Self Assign') && ['Accepted', 'Processed', 'Received'].includes(orderStatus) && (
              <button
                onClick={() => setShowRiderModal(true)}
                className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
              >
                <span>🛵</span> Assign by Seller
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          <section className={cardCls}>
            <h2 className={cardTitleCls}>Items ({orderDetail.items.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Unit</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Tax ₹ (%)</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {orderDetail.items.map((item) => (
                    <tr key={item.srNo}>
                      <td className="px-4 py-3 text-neutral-900 font-medium">{item.product}</td>
                      <td className="px-4 py-3 text-neutral-600">{formatUnit(item.unit, item.qty)}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{money(item.price)}</td>
                      <td className="px-4 py-3 text-right text-neutral-500">
                        {item.tax.toFixed(2)} ({item.taxPercent.toFixed(2)}%)
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">{item.qty}</td>
                      <td className="px-4 py-3 text-right text-neutral-900 font-semibold">{money(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 space-y-1 text-sm">
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
          </section>

          {/* Earning breakdown */}
          {earningBreakdown && (
            <section className={cardCls}>
              <h2 className={cardTitleCls}>Earning breakdown</h2>
              <div className="p-4">
                <div className={rowCls}>
                  <span className="text-neutral-500">Admin (commission + platform fee)</span>
                  <span className="font-semibold text-teal-700">{money(earningBreakdown.totalAdminEarning ?? 0)}</span>
                </div>
                <div className={rowCls}>
                  <span className="text-neutral-500">Your earning (this order)</span>
                  <span className="font-semibold text-green-700">{money(earningBreakdown.yourEarning ?? 0)}</span>
                </div>
                {earningBreakdown.note && <p className="text-xs text-neutral-500 mt-2">{earningBreakdown.note}</p>}
              </div>
            </section>
          )}
        </div>

        {/* Side details */}
        <div className="space-y-4">
          <section className={cardCls}>
            <h2 className={cardTitleCls}>Customer</h2>
            <div className="p-4">
              <p className="text-sm font-semibold text-neutral-900">{orderDetail.customerName || 'N/A'}</p>
              {orderDetail.customerPhone && (
                <a href={`tel:${orderDetail.customerPhone}`} className="block text-sm text-teal-700 font-medium mt-1 hover:underline">
                  {orderDetail.customerPhone}
                </a>
              )}
              {orderDetail.customerEmail && <p className="text-xs text-neutral-500 mt-1 break-all">{orderDetail.customerEmail}</p>}
            </div>
          </section>

          <section className={cardCls}>
            <h2 className={cardTitleCls}>Delivery address</h2>
            <div className="p-4">
              <p className="text-sm text-neutral-800 leading-relaxed">{address.formatted}</p>
              {address.mapsUrl && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">
                    {address.latitude?.toFixed(6)}, {address.longitude?.toFixed(6)}
                  </span>
                  <a
                    href={address.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold text-[11px] print:hidden"
                  >
                    Open in Maps ↗
                  </a>
                </div>
              )}
            </div>
          </section>

          <section className={cardCls}>
            <h2 className={cardTitleCls}>Delivery</h2>
            <div className="p-4">
              <div className={rowCls}>
                <span className="text-neutral-500">Delivery type</span>
                {orderDetail.deliveryOption === 'Instant' ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Instant</span>
                ) : orderDetail.deliveryOption === 'Standard' ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-800">Standard</span>
                ) : (
                  <span className="text-neutral-900">—</span>
                )}
              </div>
              <div className={rowCls}>
                <span className="text-neutral-500">Delivery partner</span>
                <span className="text-right">
                  {hasRider ? (
                    <>
                      <span className="block font-medium text-neutral-900">🛵 {orderDetail.deliveryBoyName}</span>
                      {orderDetail.deliveryBoyPhone && <span className="block text-xs text-neutral-500">{orderDetail.deliveryBoyPhone}</span>}
                    </>
                  ) : (
                    <span className="text-neutral-400 italic">Not Assigned</span>
                  )}
                </span>
              </div>
              {/* A rider is involved only after the seller accepts the order. */}
              {!isFinished && !['Received', 'Pending'].includes(orderStatus) && (
                <button
                  onClick={() => setShowRiderModal(true)}
                  className={
                    hasRider
                      ? 'mt-1 text-xs font-semibold text-teal-700 hover:underline print:hidden'
                      : 'mt-2 w-full inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-xs font-bold print:hidden'
                  }
                >
                  {hasRider ? 'Change delivery partner' : <><span>🛵</span> Assign Delivery Partner</>}
                </button>
              )}
            </div>
          </section>

          <section className={cardCls}>
            <h2 className={cardTitleCls}>Payment</h2>
            <div className="p-4">
              <div className={rowCls}>
                <span className="text-neutral-500">Method</span>
                <span className="font-medium text-neutral-900">{orderDetail.paymentMethod}</span>
              </div>
              <div className={rowCls}>
                <span className="text-neutral-500">Status</span>
                <span className={`font-medium ${orderDetail.paymentStatus === 'Paid' ? 'text-green-700' : 'text-amber-700'}`}>{orderDetail.paymentStatus}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Delivery Assignment Mode Popup */}
      {showAssignPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden border border-neutral-200">
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Accept Order & Assign Delivery</h3>
            <p className="text-neutral-600 mb-6 text-sm">
              Please choose how you would like to assign the delivery for this order.
            </p>

            <div className="space-y-3 mb-6">
              <label
                className={`flex items-start p-4 border rounded-xl cursor-pointer transition-all ${
                  deliveryPreference === 'Self' ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="delivery_preference"
                  value="Self"
                  checked={deliveryPreference === 'Self'}
                  onChange={() => setDeliveryPreference('Self')}
                  className="w-4 h-4 mt-0.5 text-teal-600 border-neutral-300 focus:ring-teal-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-bold text-neutral-900">Assign by Seller</span>
                  <span className="block text-xs text-neutral-500 mt-0.5">
                    Manually select a delivery partner from the list of available online riders.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start p-4 border rounded-xl cursor-pointer transition-all ${
                  deliveryPreference === 'Admin' ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="delivery_preference"
                  value="Admin"
                  checked={deliveryPreference === 'Admin'}
                  onChange={() => setDeliveryPreference('Admin')}
                  className="w-4 h-4 mt-0.5 text-teal-600 border-neutral-300 focus:ring-teal-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-bold text-neutral-900">Assigned By Admin</span>
                  <span className="block text-xs text-neutral-500 mt-0.5">
                    Let the platform admin assign an eligible delivery partner for this order.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAssignPopup(false)}
                className="px-5 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowAssignPopup(false);
                  if (deliveryPreference === 'Self') {
                    await handleStatusUpdate('Accepted', 'Self');
                    setShowRiderModal(true);
                  } else {
                    await handleStatusUpdate('Accepted', 'Admin');
                  }
                }}
                className="px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-sm"
              >
                {deliveryPreference === 'Self' ? 'Accept & Select Rider' : 'Confirm & Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Delivery Partner Selection Modal */}
      {orderDetail && (
        <SellerAssignDeliveryBoyModal
          isOpen={showRiderModal}
          onClose={() => setShowRiderModal(false)}
          orderId={orderDetail.id}
          orderNumber={orderDetail.invoiceNumber || orderDetail.id}
          onAssignSuccess={(rider) => {
            setOrderDetail((prev) =>
              prev
                ? {
                    ...prev,
                    deliveryBoyName: rider?.name || 'Assigned Partner',
                    deliveryBoyPhone: rider?.mobile || '',
                  }
                : null
            );
            setOrderStatus('Processed');
          }}
        />
      )}

      <ConfirmationModal
        isOpen={showRejectModal}
        title="Reject Order"
        message="Are you sure you want to reject this order? This cannot be undone."
        confirmText="Reject Order"
        variant="danger"
        onConfirm={async () => {
          setShowRejectModal(false);
          await handleStatusUpdate('Rejected');
        }}
        onCancel={() => setShowRejectModal(false)}
      />
    </div>
  );
}


