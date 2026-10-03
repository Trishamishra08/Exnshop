import { useMemo, useState } from 'react';
import { Product } from '../../../services/api/productService';
import BidVisibilityMeter from './BidVisibilityMeter';

export interface SelectedProductBid {
    productId: string;
    cpcBid: string;
}

interface ProductMultiSelectProps {
    products: Product[];
    selected: SelectedProductBid[];
    onChange: (selected: SelectedProductBid[]) => void;
}

function getCategoryId(product?: Product): string | undefined {
    if (!product || !product.category) return undefined;
    return typeof product.category === 'string' ? product.category : product.category._id;
}

export default function ProductMultiSelect({ products, selected, onChange }: ProductMultiSelectProps) {
    const [search, setSearch] = useState('');

    const selectedIds = useMemo(() => new Set(selected.map((s) => s.productId)), [selected]);
    const productById = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

    const filteredProducts = useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase();
        return products.filter((p) => p.productName.toLowerCase().includes(q));
    }, [products, search]);

    const toggleProduct = (productId: string) => {
        if (selectedIds.has(productId)) {
            onChange(selected.filter((s) => s.productId !== productId));
        } else {
            onChange([...selected, { productId, cpcBid: '' }]);
        }
    };

    const updateBid = (productId: string, cpcBid: string) => {
        onChange(selected.map((s) => (s.productId === productId ? { ...s, cpcBid } : s)));
    };

    return (
        <div>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your products..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-teal-500"
            />

            <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100 mb-4">
                {filteredProducts.length === 0 ? (
                    <p className="p-3 text-xs text-neutral-400">No products found.</p>
                ) : (
                    filteredProducts.map((p) => (
                        <label key={p._id} className="flex items-center gap-2 p-2.5 text-sm hover:bg-neutral-50 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedIds.has(p._id)}
                                onChange={() => toggleProduct(p._id)}
                                className="accent-teal-600"
                            />
                            {p.mainImage && (
                                <img src={p.mainImage} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            )}
                            <span className="truncate">{p.productName}</span>
                        </label>
                    ))
                )}
            </div>

            {selected.length > 0 && (
                <div className="space-y-4">
                    <p className="text-sm font-medium text-neutral-700">{selected.length} product{selected.length > 1 ? 's' : ''} selected — set a bid for each</p>
                    {selected.map((s) => {
                        const product = productById.get(s.productId);
                        return (
                            <div key={s.productId} className="border border-neutral-200 rounded-lg p-3">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-sm font-medium truncate">{product?.productName || s.productId}</span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className="text-xs text-neutral-500">Set CPC</span>
                                        <span className="text-sm text-neutral-500">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={s.cpcBid}
                                            onChange={(e) => updateBid(s.productId, e.target.value)}
                                            className="w-20 px-2 py-1 border border-neutral-300 rounded text-sm focus:ring-2 focus:ring-teal-500"
                                        />
                                    </div>
                                </div>
                                <BidVisibilityMeter categoryId={getCategoryId(product)} cpcBid={Number(s.cpcBid) || 0} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
