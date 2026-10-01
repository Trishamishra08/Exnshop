import { useState, useRef } from 'react';
import {
    downloadBulkUploadTemplate,
    bulkUploadProducts,
    BulkUploadResult,
} from '../../../services/api/productService';
import { useToast } from '../../../context/ToastContext';

export default function SellerBulkUpload() {
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [result, setResult] = useState<BulkUploadResult | null>(null);
    const [error, setError] = useState('');

    const handleDownloadTemplate = async () => {
        try {
            setDownloading(true);
            const blob = await downloadBulkUploadTemplate();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'exnshop_bulk_product_template.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast('Failed to download template', 'error');
        } finally {
            setDownloading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.csv')) {
            setError('Please select a .csv file');
            return;
        }
        setSelectedFile(file);
        setError('');
        setResult(null);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        try {
            setUploading(true);
            setError('');
            setResult(null);
            const response = await bulkUploadProducts(selectedFile);
            if (response.success && response.data) {
                setResult(response.data);
                showToast(
                    `${response.data.successCount} products submitted for review, ${response.data.errorCount} failed.`,
                    response.data.errorCount > 0 ? 'error' : 'success'
                );
            } else {
                setError(response.message || 'Upload failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-teal-600 text-white px-4 sm:px-6 py-3">
                    <h2 className="text-lg font-semibold">Bulk Product Upload</h2>
                </div>
                <div className="p-4 sm:p-6 space-y-6">
                    {/* Step 1: Template */}
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-neutral-800 mb-1">1. Download the CSV template</h3>
                        <p className="text-xs text-neutral-500 mb-3">
                            Fill in one row per product. headerCategory, category and brand must match names that
                            already exist in the catalog. Each row creates one product with a single variation — for
                            multiple variations, add them afterward from the product's edit page.
                        </p>
                        <button
                            onClick={handleDownloadTemplate}
                            disabled={downloading}
                            className="px-4 py-2 bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {downloading ? 'Downloading...' : 'Download Template (.csv)'}
                        </button>
                    </div>

                    {/* Step 2: Upload */}
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-neutral-800 mb-1">2. Upload your filled CSV</h3>
                        <p className="text-xs text-neutral-500 mb-3">
                            Every row you submit goes through the same admin review as a single product — nothing
                            goes live until approved. Max 1000 rows per file.
                        </p>
                        {error && (
                            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                                {error}
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="text-sm text-neutral-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:text-sm file:font-medium hover:file:bg-teal-700 file:cursor-pointer cursor-pointer"
                            />
                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || uploading}
                                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                {uploading ? 'Uploading...' : 'Upload & Process'}
                            </button>
                        </div>
                    </div>

                    {/* Results */}
                    {result && (
                        <div className="border border-neutral-200 rounded-lg overflow-hidden">
                            <div className="bg-neutral-50 px-4 py-3 flex flex-wrap gap-4 border-b border-neutral-200">
                                <div>
                                    <span className="text-xs text-neutral-500 block">Total rows</span>
                                    <span className="text-lg font-bold text-neutral-800">{result.totalRows}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-neutral-500 block">Submitted for review</span>
                                    <span className="text-lg font-bold text-green-600">{result.successCount}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-neutral-500 block">Failed</span>
                                    <span className="text-lg font-bold text-red-600">{result.errorCount}</span>
                                </div>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-neutral-50 text-xs font-semibold text-neutral-600 sticky top-0">
                                            <tr>
                                                <th className="p-3 w-20">Row</th>
                                                <th className="p-3">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.errors.map((e, idx) => (
                                                <tr key={idx} className="border-t border-neutral-100">
                                                    <td className="p-3 text-neutral-500">{e.row}</td>
                                                    <td className="p-3 text-red-700">{e.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
