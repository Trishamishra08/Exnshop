import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCategories, getSubcategories, Category, SubCategory } from '../../../services/api/categoryService';
import { getAllowedHeaderCategories } from '../../../services/api/productService';

/**
 * The departments and categories this seller is allowed to list products in
 * (granted by the admin), with each category's subcategories. Read-only: products
 * are listed under one of these when adding a product.
 */
const idOf = (v: any): string => (v && typeof v === 'object' ? v._id || '' : v || '');

export default function SellerCategory() {
  const [headers, setHeaders] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Record<string, SubCategory[] | 'loading'>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [h, c] = await Promise.all([getAllowedHeaderCategories(), getCategories()]);
        setHeaders(h.success && Array.isArray(h.data) ? h.data : []);
        setCategories(c.success && Array.isArray(c.data) ? c.data : []);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Could not load your categories');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (cat: Category) => {
    if (open === cat._id) return setOpen(null);
    setOpen(cat._id);
    if (subs[cat._id]) return;
    setSubs((s) => ({ ...s, [cat._id]: 'loading' }));
    try {
      const res = await getSubcategories(cat._id);
      setSubs((s) => ({ ...s, [cat._id]: res.success && Array.isArray(res.data) ? res.data : [] }));
    } catch {
      setSubs((s) => ({ ...s, [cat._id]: [] }));
    }
  };

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return headers
      .map((h) => ({
        header: h,
        cats: categories.filter((c) => idOf(c.headerCategoryId) === String(h._id) && (!q || String(c.name || '').toLowerCase().includes(q))),
      }))
      .filter((g) => g.cats.length > 0 || !q);
  }, [headers, categories, search]);

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-6">
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <h1 className="text-lg font-bold text-neutral-900">My Categories</h1>
        <p className="text-xs text-neutral-500 mt-1">
          You can list products in these departments and categories. To sell in another department, contact the Exnshop team.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search category"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-neutral-300 text-sm" />
          <Link to="/seller/product/add" className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">+ Add product</Link>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-neutral-500">Loading…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-red-600">{error}</div>
      ) : headers.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-neutral-500">
          No departments are assigned to your store yet. Contact the Exnshop team to get access.
        </div>
      ) : (
        groups.map(({ header, cats }) => (
          <div key={header._id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 bg-teal-50 border-b border-teal-100 flex items-center justify-between">
              <p className="font-semibold text-teal-900">{header.name}</p>
              <span className="text-xs text-teal-700">{cats.length} categor{cats.length === 1 ? 'y' : 'ies'}</span>
            </div>
            {cats.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">No categories in this department yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {cats.map((c) => {
                  const list = subs[c._id];
                  return (
                    <li key={c._id}>
                      <button type="button" onClick={() => toggle(c)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50">
                        {(c as any).image ? (
                          <img src={(c as any).image} alt="" className="w-9 h-9 rounded-lg object-cover border border-neutral-200" />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs">{String(c.name || '?').charAt(0)}</span>
                        )}
                        <span className="flex-1 text-sm font-medium text-neutral-800">{c.name}</span>
                        <span className="text-neutral-400 text-sm">{open === c._id ? '▲' : '▼'}</span>
                      </button>
                      {open === c._id && (
                        <div className="px-4 pb-3 pl-16">
                          {list === 'loading' || !list ? (
                            <p className="text-xs text-neutral-500">Loading subcategories…</p>
                          ) : list.length === 0 ? (
                            <p className="text-xs text-neutral-500">No subcategories — list products directly under {c.name}.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {list.map((s: any) => (
                                <span key={s._id} className="px-2.5 py-1 rounded-full bg-neutral-100 text-xs text-neutral-700">{s.subcategoryName || s.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
