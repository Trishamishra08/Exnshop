import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getReturnRequests,
  getReturnRequestById,
  updateReturnStatus,
  confirmSellerReceipt,
  retryReplacementOrder,
  ReturnRequest,
  ReturnRequestDetail,
  GetReturnRequestsParams,
} from '../../../services/api/returnService';
import { useToast } from '../../../context/ToastContext';

export default function SellerReturnRequest() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [fromDate, setFromDate] = useState('12/06/2025');
  const [toDate, setToDate] = useState('12/06/2025');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal States
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [fullDetail, setFullDetail] = useState<ReturnRequestDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showConfirmReceiptModal, setShowConfirmReceiptModal] = useState(false);
  const [qcResult, setQcResult] = useState<'' | 'Passed' | 'Failed'>('');
  const [qcNote, setQcNote] = useState('');

  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Fetch return requests from API
  const fetchReturnRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const params: GetReturnRequestsParams = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn || 'returnDate',
        sortOrder: sortDirection,
      };

      if (fromDate && toDate && fromDate !== '12/06/2025') {
        params.dateFrom = fromDate;
        params.dateTo = toDate;
      }

      if (statusFilter !== 'All Status') {
        params.status = statusFilter;
      }

      if (typeFilter !== 'All Types') {
        params.requestType = typeFilter as any;
      }

      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await getReturnRequests(params);
      if (response.success && response.data) {
        setReturnRequests(response.data);
      } else {
        setError(response.message || 'Failed to fetch return requests');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch return requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnRequests();
  }, [fromDate, toDate, statusFilter, typeFilter, searchTerm, currentPage, rowsPerPage, sortColumn, sortDirection]);

  // Deep Link Handling: Auto-open detail if ?id= is in query string
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (targetId) {
      (async () => {
        try {
          setLoadingDetail(true);
          setShowDetailModal(true);
          const res = await getReturnRequestById(targetId);
          if (res.success && res.data) {
            setFullDetail(res.data);
            setSelectedReturn({
              id: res.data.id || targetId,
              orderItemId: res.data.orderItemId || targetId,
              product: res.data.productName || 'Product',
              variant: res.data.variantTitle || 'Standard',
              requestType: res.data.requestType || 'RETURN',
              price: res.data.price || 0,
              discPrice: res.data.discPrice || 0,
              quantity: res.data.quantity || 1,
              total: res.data.total || 0,
              status: res.data.status,
              date: res.data.returnDate || new Date().toISOString(),
              customerName: res.data.customerName,
              orderId: res.data.orderId,
              reason: res.data.reason,
            });
          }
        } catch (err) {
          console.error('Error opening linked return detail:', err);
        } finally {
          setLoadingDetail(false);
        }
      })();
    }
  }, [searchParams]);

  // Client-side pagination
  const totalPages = Math.ceil(returnRequests.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedRequests = returnRequests.slice(startIndex, endIndex);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => (
    <span className="text-neutral-300 text-[10px]">
      {sortColumn === column ? (sortDirection === 'asc' ? '↑' : '↓') : '⇵'}
    </span>
  );

  const handleClearDates = () => {
    setFromDate('');
    setToDate('');
  };

  // Open Return Request Details Modal
  const handleOpenDetails = async (reqItem: ReturnRequest) => {
    setSelectedReturn(reqItem);
    setShowDetailModal(true);
    setLoadingDetail(true);
    setFullDetail(null);
    try {
      const res = await getReturnRequestById(reqItem.id);
      if (res.success && res.data) {
        setFullDetail(res.data);
      }
    } catch (err: any) {
      // Fallback cleanly to item summary if detail fetch fails
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle Accept Return Action
  const handleAcceptReturn = async () => {
    if (!selectedReturn) return;
    setSubmittingAction(true);
    try {
      const res = await updateReturnStatus(selectedReturn.id, { status: 'Approved' });
      if (res.success) {
        showToast('Return request approved successfully! Pickup scheduled.', 'success');
        setShowAcceptModal(false);
        setShowDetailModal(false);
        fetchReturnRequests();
      } else {
        showToast(res.message || 'Failed to approve return request', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to approve return request', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Reject Return Action
  const handleRejectReturn = async () => {
    if (!selectedReturn) return;
    if (!rejectionReasonInput.trim()) {
      showToast('Please enter a reason for rejecting this return request.', 'error');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await updateReturnStatus(selectedReturn.id, {
        status: 'Rejected',
        reason: rejectionReasonInput.trim(),
      });
      if (res.success) {
        showToast('Return request rejected.', 'info');
        setShowRejectModal(false);
        setShowDetailModal(false);
        setRejectionReasonInput('');
        fetchReturnRequests();
      } else {
        showToast(res.message || 'Failed to reject return request', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to reject return request', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Confirm Receipt Action
  const handleConfirmReceipt = async () => {
    if (!selectedReturn) return;
    const isExchange = selectedReturn.requestType === 'EXCHANGE';
    if (isExchange && !qcResult) {
      showToast('Record whether the returned item passed the quality check', 'error');
      return;
    }
    if (qcResult === 'Failed' && !qcNote.trim()) {
      showToast('Describe what is wrong with the returned item', 'error');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await confirmSellerReceipt(selectedReturn.id, qcResult ? { qcResult, qcNote: qcNote.trim() || undefined } : undefined);
      if (res.success) {
        showToast(isExchange ? res.message || 'Receipt recorded' : '✅ Receipt confirmed! Return marked Completed and customer refund processed.', 'success');
        setQcResult('');
        setQcNote('');
        setShowConfirmReceiptModal(false);
        setShowDetailModal(false);
        fetchReturnRequests();
      } else {
        showToast(res.message || 'Failed to confirm receipt', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to confirm receipt', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Approved':
      case 'Pickup Pending':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'Delivery Partner Assigned':
        return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
      case 'Picked Up':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'In Transit':
        return 'bg-sky-100 text-sky-800 border border-sky-200';
      case 'Handed To Seller':
        return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'Completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border border-red-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border border-neutral-200';
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-neutral-50">
      {/* Top Header */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900">Return Request</h1>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/seller" className="text-blue-600 hover:text-blue-700">
              Home
            </Link>
            <span className="text-neutral-400">/</span>
            <span className="text-neutral-900">Return Request</span>
          </div>
        </div>
      </div>

      {/* Content Card */}
      <div className="flex-1 p-4 sm:p-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col">
          {/* Green Header Banner */}
          <div className="bg-green-600 text-white px-4 sm:px-6 py-3 rounded-t-lg">
            <h2 className="text-lg sm:text-xl font-semibold">View Return Request</h2>
          </div>

          {/* Controls Panel */}
          <div className="p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-neutral-100">
            {/* Left Side: Date & Status Filters */}
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 whitespace-nowrap">From - To Date:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={fromDate && toDate ? `${fromDate} - ${toDate}` : ''}
                    placeholder="Select date range"
                    className="pl-10 pr-3 py-2 bg-white border border-neutral-300 rounded text-sm focus:ring-1 focus:ring-green-500 focus:outline-none w-full sm:w-64"
                    readOnly
                  />
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
                <button
                  onClick={handleClearDates}
                  className="px-3 py-2 bg-neutral-700 hover:bg-neutral-800 text-white text-sm rounded transition-colors"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 whitespace-nowrap">Filter by Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-neutral-300 rounded text-sm focus:ring-1 focus:ring-green-500 focus:outline-none cursor-pointer"
                >
                  <option value="All Status">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Pickup Pending">Pickup Pending</option>
                  <option value="Delivery Partner Assigned">Delivery Partner Assigned</option>
                  <option value="Picked Up">Picked Up</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Handed To Seller">Handed To Seller</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 whitespace-nowrap">Type:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-neutral-300 rounded text-sm focus:ring-1 focus:ring-green-500 focus:outline-none cursor-pointer font-medium"
                >
                  <option value="All Types">All Types</option>
                  <option value="RETURN">↩ Returns Only</option>
                  <option value="EXCHANGE">🔄 Exchanges Only</option>
                </select>
              </div>
            </div>

            {/* Right Side: Export, Per Page, Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">Per Page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-green-500 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <button
                onClick={() => {
                  const headers = ['Order Item Id', 'Type', 'Product', 'Variant', 'Price', 'Disc Price', 'Quantity', 'Total', 'Status', 'Date'];
                  const csvContent = [
                    headers.join(','),
                    ...returnRequests.map((reqItem) => [
                      reqItem.orderItemId,
                      reqItem.requestType || 'RETURN',
                      `"${reqItem.product}"`,
                      `"${reqItem.variant}"`,
                      reqItem.price,
                      reqItem.discPrice,
                      reqItem.quantity,
                      reqItem.total,
                      `"${reqItem.status}"`,
                      reqItem.date,
                    ].join(',')),
                  ].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  const url = URL.createObjectURL(blob);
                  link.setAttribute('href', url);
                  link.setAttribute('download', `return_requests_${new Date().toISOString().split('T')[0]}.csv`);
                  link.style.visibility = 'hidden';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export
              </button>

              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">Search:</span>
                <input
                  type="text"
                  className="pl-14 pr-3 py-1.5 bg-neutral-100 border-none rounded text-sm focus:ring-1 focus:ring-green-500 w-full sm:w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Loading & Error States */}
          {loading && (
            <div className="flex items-center justify-center p-8 text-neutral-500">
              Loading return & exchange requests...
            </div>
          )}
          {error && !loading && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg m-4">
              {error}
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-neutral-200">
                <thead>
                  <tr className="bg-neutral-50 text-xs font-bold text-neutral-800">
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('orderItemId')}>
                      <div className="flex items-center gap-1">Order Item Id <SortIcon column="orderItemId" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200">Type</th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('product')}>
                      <div className="flex items-center gap-1">Product <SortIcon column="product" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('variant')}>
                      <div className="flex items-center gap-1">Variant <SortIcon column="variant" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('price')}>
                      <div className="flex items-center gap-1">Price <SortIcon column="price" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('discPrice')}>
                      <div className="flex items-center gap-1">Disc Price <SortIcon column="discPrice" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('quantity')}>
                      <div className="flex items-center gap-1">Quantity <SortIcon column="quantity" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('total')}>
                      <div className="flex items-center gap-1">Total <SortIcon column="total" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">Status <SortIcon column="status" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200 cursor-pointer" onClick={() => handleSort('date')}>
                      <div className="flex items-center gap-1">Date <SortIcon column="date" /></div>
                    </th>
                    <th className="p-4 border border-neutral-200">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-neutral-500">
                        No return or exchange requests available
                      </td>
                    </tr>
                  ) : (
                    displayedRequests.map((reqItem, index) => (
                      <tr key={reqItem.id || index} className="hover:bg-neutral-50 border-b border-neutral-200">
                        <td className="p-4 border border-neutral-200 text-sm font-medium text-neutral-900">{reqItem.orderItemId || reqItem.id}</td>
                        <td className="p-4 border border-neutral-200 text-sm">
                          {reqItem.requestType === 'EXCHANGE' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              <span>🔄</span> Exchange
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span>↩</span> Return
                            </span>
                          )}
                        </td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-900 font-semibold">{reqItem.product || (reqItem as any).productName || 'Product'}</td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-600">{reqItem.variant || 'Standard'}</td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-900">₹{Number(reqItem.price || 0).toFixed(2)}</td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-900">₹{Number(reqItem.discPrice || reqItem.price || 0).toFixed(2)}</td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-900 font-semibold">{reqItem.quantity ?? 1}</td>
                        <td className="p-4 border border-neutral-200 text-sm font-bold text-neutral-900">₹{Number(reqItem.total || (reqItem as any).amount || 0).toFixed(2)}</td>
                        <td className="p-4 border border-neutral-200 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(reqItem.status)}`}>
                            {reqItem.status}
                          </span>
                        </td>
                        <td className="p-4 border border-neutral-200 text-sm text-neutral-600">
                          {reqItem.date ? new Date(reqItem.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td className="p-4 border border-neutral-200 text-sm">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* View Detail Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenDetails(reqItem)}
                              className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-300 rounded text-xs font-medium transition-colors"
                            >
                              View
                            </button>

                            {/* Pending State Actions: Accept & Reject */}
                            {reqItem.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReturn(reqItem);
                                    setShowAcceptModal(true);
                                  }}
                                  className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReturn(reqItem);
                                    setRejectionReasonInput('');
                                    setShowRejectModal(true);
                                  }}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* Handed to Seller Action: Confirm Receipt */}
                            {reqItem.status === 'Handed To Seller' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedReturn(reqItem);
                                  setShowConfirmReceiptModal(true);
                                }}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-xs transition-colors"
                              >
                                ✅ Confirm Receipt
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          <div className="p-4 border-t border-neutral-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-neutral-600">
              Showing {returnRequests.length === 0 ? 0 : startIndex + 1} to {Math.min(endIndex, returnRequests.length)} of {returnRequests.length} entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || totalPages === 0}
                className="w-8 h-8 flex items-center justify-center border border-green-300 rounded hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ‹
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="w-8 h-8 flex items-center justify-center border border-green-300 rounded hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── 1. RETURN REQUEST DETAILS MODAL ────────────────── */}
      {showDetailModal && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-neutral-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <span>{(fullDetail?.requestType || selectedReturn.requestType) === 'EXCHANGE' ? '🔄' : '↩'}</span>
                  {(fullDetail?.requestType || selectedReturn.requestType) === 'EXCHANGE' ? 'Exchange / Replacement Request' : 'Return & Refund Request'}
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  Order ID: {fullDetail?.orderId || selectedReturn.orderId || selectedReturn.orderItemId}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-700 flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {loadingDetail ? (
                <div className="p-8 text-center text-neutral-500 font-medium">Loading details...</div>
              ) : (
                <>
                  {/* Status & Type Badge Banner */}
                  <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                    <div>
                      <span className="text-xs text-neutral-500 block uppercase font-bold tracking-wider">Request Type & Status</span>
                      <div className="flex items-center gap-2 mt-1">
                        {(fullDetail?.requestType || selectedReturn.requestType) === 'EXCHANGE' ? (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            🔄 Exchange (Replacement)
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ↩ Return (Refund)
                          </span>
                        )}
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(fullDetail?.status || selectedReturn.status)}`}>
                          {fullDetail?.status || selectedReturn.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-neutral-500 block uppercase font-bold tracking-wider">Item Total</span>
                      <span className="text-lg font-extrabold text-neutral-900">
                        ₹{Number(fullDetail?.total || selectedReturn.total || (selectedReturn as any).amount || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Rejection Notice if Status is Rejected */}
                  {(fullDetail?.status === 'Rejected' || selectedReturn.status === 'Rejected') && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 text-sm space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-red-700">
                        <span>❌</span> Return Request Rejected
                      </p>
                      <p className="text-xs text-red-700">
                        Reason: {fullDetail?.reason || (selectedReturn as any).rejectionReason || 'Seller rejected this return request.'}
                      </p>
                    </div>
                  )}

                  {/* E-commerce: courier reverse pickup details */}
                  {(fullDetail as any)?.shiprocketReturn && (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm space-y-1">
                      <p className="font-bold text-indigo-800">🚚 Courier pickup from the customer</p>
                      {(fullDetail as any).shiprocketReturn.awbCode ? (
                        <p className="text-xs text-indigo-900">
                          {(fullDetail as any).shiprocketReturn.courierName || 'Courier'} · AWB {(fullDetail as any).shiprocketReturn.awbCode}
                          {(fullDetail as any).shiprocketReturn.status ? ` · ${(fullDetail as any).shiprocketReturn.status}` : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-red-700">
                          Not booked yet{(fullDetail as any).shiprocketReturn.error ? `: ${(fullDetail as any).shiprocketReturn.error}` : ''}. Exnshop support can retry it.
                        </p>
                      )}
                      {(fullDetail as any).shiprocketReturn.trackingUrl && (
                        <a href={(fullDetail as any).shiprocketReturn.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">
                          Track pickup ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Exchange completed without a replacement (e.g. out of stock): retry */}
                  {(fullDetail?.requestType || selectedReturn.requestType) === 'EXCHANGE' &&
                    (fullDetail?.status || selectedReturn.status) === 'Completed' &&
                    !(fullDetail as any)?.replacementOrderId && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm flex items-center justify-between gap-3">
                        <p className="text-xs text-amber-900">The replacement order hasn't been created yet (usually out of stock). Restock, then create it.</p>
                        <button
                          onClick={async () => {
                            try {
                              const res = await retryReplacementOrder(selectedReturn.id);
                              showToast(res.message || 'Replacement order created', res.success ? 'success' : 'error');
                              if (res.success) setFullDetail({ ...(fullDetail as any), replacementOrderId: res.data?.orderId });
                            } catch (err: any) {
                              showToast(err.response?.data?.message || 'Could not create the replacement', 'error');
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold whitespace-nowrap">
                          Create replacement
                        </button>
                      </div>
                    )}

                  {/* 1. Product Information */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">1. Product Information</h4>
                    <div className="flex items-center gap-4 p-3 border border-neutral-200 rounded-xl bg-neutral-50/50">
                      {fullDetail?.items?.[0]?.image || selectedReturn.image ? (
                        <img
                          src={fullDetail?.items?.[0]?.image || selectedReturn.image}
                          alt="Product"
                          className="w-16 h-16 object-cover rounded-lg border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-neutral-200 rounded-lg flex items-center justify-center text-xl shrink-0">
                          📦
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-neutral-900 truncate">
                          {fullDetail?.items?.[0]?.name || selectedReturn.product || (selectedReturn as any).productName || 'Product'}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Variant: <span className="font-medium text-neutral-700">{selectedReturn.variant || 'Standard'}</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          Quantity Requested: <span className="font-bold text-neutral-900">{selectedReturn.quantity ?? 1}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Return Reason & Customer Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 border border-neutral-200 rounded-xl space-y-2 bg-neutral-50/50">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">2. Return Reason</h4>
                      <p className="text-sm font-semibold text-neutral-900">
                        {fullDetail?.reason || selectedReturn.returnReason || selectedReturn.reason || 'Not specified'}
                      </p>
                      {fullDetail?.reasonDescription && (
                        <p className="text-xs text-neutral-600 bg-white p-2.5 rounded-lg border border-neutral-200">
                          "{fullDetail.reasonDescription}"
                        </p>
                      )}
                      {(() => {
                        const d: any = fullDetail || {};
                        const variant = d.requestedVariation || selectedReturn.requestedVariation;
                        const condition = d.condition || selectedReturn.condition;
                        const photos: string[] = d.photos || selectedReturn.photos || [];
                        const flags: string[] = d.flags || selectedReturn.flags || [];
                        const qc = d.qc || selectedReturn.qc;
                        return (
                          <>
                            {variant && <p className="text-xs text-neutral-700">Wants: <b>{variant.label}</b></p>}
                            {condition && <p className="text-xs text-neutral-700">Customer says item is: <b>{condition}</b></p>}
                            {flags.includes('REPEAT_REQUESTS') && (
                              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">This customer has made several return/exchange requests recently.</p>
                            )}
                            {photos.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {photos.map((p, i) => (
                                  <a key={i} href={p} target="_blank" rel="noreferrer">
                                    <img src={p} alt={`Evidence ${i + 1}`} className="w-14 h-14 object-cover rounded-lg border border-neutral-200" />
                                  </a>
                                ))}
                              </div>
                            )}
                            {qc && (
                              <p className={`text-xs rounded-lg p-2 border ${qc.result === 'Passed' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-800 bg-red-50 border-red-200'}`}>
                                Quality check: <b>{qc.result}</b>{qc.note ? ` · ${qc.note}` : ''}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="p-4 border border-neutral-200 rounded-xl space-y-1 bg-neutral-50/50">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">3. Customer Details</h4>
                      <p className="text-sm font-semibold text-neutral-900">
                        {fullDetail?.customerName || selectedReturn.customerName || 'Customer'}
                      </p>
                      {fullDetail?.customerEmail && <p className="text-xs text-neutral-600">✉️ {fullDetail.customerEmail}</p>}
                      {fullDetail?.customerPhone && <p className="text-xs text-neutral-600">📞 {fullDetail.customerPhone}</p>}
                    </div>
                  </div>

                  {/* 4. Timeline Stepper */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">4. Return Lifecycle Stage</h4>
                    <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50/50">
                      <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 space-x-1">
                        {['Pending', 'Approved', 'Picked Up', 'Handed To Seller', 'Completed'].map((stage, idx) => {
                          const currentStageName = fullDetail?.status || selectedReturn.status;
                          const isPassed =
                            (currentStageName === 'Completed' && idx <= 4) ||
                            (currentStageName === 'Handed To Seller' && idx <= 3) ||
                            (currentStageName === 'Picked Up' && idx <= 2) ||
                            (currentStageName === 'In Transit' && idx <= 2) ||
                            (currentStageName === 'Delivery Partner Assigned' && idx <= 1) ||
                            (currentStageName === 'Pickup Pending' && idx <= 1) ||
                            (currentStageName === 'Approved' && idx <= 1) ||
                            (currentStageName === 'Pending' && idx === 0);

                          return (
                            <div key={stage} className="flex-1 text-center">
                              <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center font-bold text-[10px] mb-1 ${
                                isPassed ? 'bg-green-600 text-white' : 'bg-neutral-200 text-neutral-500'
                              }`}>
                                {idx + 1}
                              </div>
                              <span className="text-[10px] block leading-tight">{stage}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3 bg-neutral-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
              {selectedReturn.status === 'Pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectionReasonInput('');
                      setShowRejectModal(true);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    Reject Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAcceptModal(true)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    Accept Request
                  </button>
                </>
              )}
              {selectedReturn.status === 'Handed To Seller' && (
                <button
                  type="button"
                  onClick={() => setShowConfirmReceiptModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  ✅ Confirm Receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 2. ACCEPT RETURN MODAL ────────────────── */}
      {showAcceptModal && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <span>✅</span> Accept Return Request?
            </h3>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2 text-sm text-green-900">
              <p>Product: <span className="font-bold">{selectedReturn.product || 'Product'}</span></p>
              <p>Refund Amount: <span className="font-bold">₹{Number(selectedReturn.total || (selectedReturn as any).amount || 0).toFixed(2)}</span></p>
              <p>Return Reason: <span className="font-bold">{selectedReturn.returnReason || selectedReturn.reason || 'Not specified'}</span></p>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Accepting this request will authorize return pickup. Money will <span className="font-semibold text-neutral-900">NOT</span> be refunded automatically until you physically receive and confirm the returned product.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => setShowAcceptModal(false)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleAcceptReturn}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
              >
                {submittingAction ? 'Processing...' : 'Accept Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 3. REJECT RETURN MODAL ────────────────── */}
      {showRejectModal && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <span>❌</span> Reject Return Request
            </h3>
            <p className="text-xs text-neutral-600">
              Please enter the reason for rejecting this return request. The customer will receive a notification containing your reason.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700">Reason for Rejection *</label>
              <textarea
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="Explain why this return cannot be accepted..."
                rows={3}
                className="w-full p-3 border border-neutral-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction || !rejectionReasonInput.trim()}
                onClick={handleRejectReturn}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
              >
                {submittingAction ? 'Processing...' : 'Reject Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 4. CONFIRM RECEIPT MODAL ────────────────── */}
      {showConfirmReceiptModal && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <span>🤝</span> Confirm Physical Receipt & Issue Refund
            </h3>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed space-y-1">
              <p className="font-bold text-sm">Product: {selectedReturn.product || 'Product'}</p>
              <p>Refund Amount: <span className="font-bold">₹{Number(selectedReturn.total || (selectedReturn as any).amount || 0).toFixed(2)}</span></p>
              <p className="mt-2 text-neutral-700">
                {selectedReturn.requestType === 'EXCHANGE'
                  ? 'Check the item that came back, then record the result. If it passes, the replacement is sent. If it fails, an admin reviews the exchange before anything is sent.'
                  : <>Confirming receipt indicates that you have physically received and inspected the returned product. This will mark the return as <span className="font-bold">Completed</span> and release the customer's refund.</>}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Quality check {selectedReturn.requestType === 'EXCHANGE' ? '' : '(optional)'}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['Passed', 'Failed'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQcResult(qcResult === r ? '' : r)}
                    className={`py-2 rounded-xl border text-xs font-semibold ${qcResult === r ? (r === 'Passed' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-red-600 bg-red-50 text-red-800') : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}
                  >
                    {r === 'Passed' ? 'Item is as expected' : 'Item has a problem'}
                  </button>
                ))}
              </div>
              {qcResult === 'Failed' && (
                <textarea
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="What is wrong? (wrong item, used, missing parts…)"
                  className="w-full border border-neutral-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => setShowConfirmReceiptModal(false)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmReceipt}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
              >
                {submittingAction ? 'Processing...' : selectedReturn.requestType === 'EXCHANGE' ? 'Record check & continue' : 'Confirm & Issue Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-4 text-center bg-white border-t border-neutral-200">
        <p className="text-xs sm:text-sm text-neutral-600">
          Copyright © 2025. Developed By{' '}
          <span className="font-semibold text-teal-600">Exnshop</span>
        </p>
      </footer>
    </div>
  );
}
