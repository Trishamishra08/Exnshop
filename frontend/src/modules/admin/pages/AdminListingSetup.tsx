import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHeaderCategoriesAdmin, HeaderCategory } from '../../../services/api/headerCategoryService';
import { getCategories, getSubcategories } from '../../../services/api/categoryService';
import {
  AdminAttribute,
  AdminListingRule,
  AttributeType,
  ScopeType,
  createAttribute,
  deleteAttribute,
  getListingSetup,
  saveListingRule,
  updateAttribute,
} from '../../../services/api/admin/adminListingService';
import { useToast } from '../../../context/ToastContext';

const TYPES: { value: AttributeType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Single choice list' },
  { value: 'multiselect', label: 'Multiple choice list' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'date', label: 'Date' },
];

interface FormState {
  id?: string;
  key: string;
  label: string;
  type: AttributeType;
  isRequired: boolean;
  isVariantAttribute: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  allowedValues: string;
  unit: string;
  helpText: string;
  group: string;
  keySpec: boolean;
  keySpecFormat: string;
  displayOrder: string;
  min: string;
  max: string;
  pattern: string;
}

const emptyForm = (): FormState => ({
  key: '',
  label: '',
  type: 'text',
  isRequired: false,
  isVariantAttribute: false,
  isFilterable: false,
  isSearchable: false,
  allowedValues: '',
  unit: '',
  helpText: '',
  group: '',
  keySpec: false,
  keySpecFormat: '',
  displayOrder: '0',
  min: '',
  max: '',
  pattern: '',
});

const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export default function AdminListingSetup() {
  const { showToast } = useToast();
  const [headers, setHeaders] = useState<HeaderCategory[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [headerId, setHeaderId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');

  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [rule, setRule] = useState<AdminListingRule>({ isRegulated: false, requiredDocs: [] });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [docLabel, setDocLabel] = useState('');

  // The most specific level picked is where attributes and rules are edited.
  const scope = useMemo<{ type: ScopeType; id: string } | null>(() => {
    if (subcategoryId) return { type: 'Category', id: subcategoryId };
    if (categoryId) return { type: 'Category', id: categoryId };
    if (headerId) return { type: 'HeaderCategory', id: headerId };
    return null;
  }, [headerId, categoryId, subcategoryId]);

  useEffect(() => {
    getHeaderCategoriesAdmin()
      .then((h) => setHeaders(h))
      .catch(() => showToast('Failed to load departments', 'error'));
    getCategories()
      .then((r) => r.success && setCategories(r.data as any[]))
      .catch(() => undefined);
  }, [showToast]);

  useEffect(() => {
    setSubcategoryId('');
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    getSubcategories(categoryId)
      .then((r) => r.success && setSubcategories(r.data as any[]))
      .catch(() => setSubcategories([]));
  }, [categoryId]);

  const load = useCallback(async () => {
    if (!scope) {
      setAttributes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await getListingSetup(scope.type, scope.id);
      setAttributes(res.data.attributes);
      setRule({ ...res.data.rule, requiredDocs: res.data.rule.requiredDocs || [] });
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to load listing setup', 'error');
    } finally {
      setLoading(false);
    }
  }, [scope, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const categoriesForHeader = categories.filter((c) => {
    const h = c.headerCategoryId;
    return !headerId || (typeof h === 'object' ? h?._id : h) === headerId;
  });

  const openEdit = (a: AdminAttribute) => {
    setFormError('');
    setForm({
      id: a._id,
      key: a.key,
      label: a.label,
      type: a.type,
      isRequired: a.isRequired,
      isVariantAttribute: a.isVariantAttribute,
      isFilterable: a.isFilterable,
      isSearchable: a.isSearchable,
      allowedValues: (a.allowedValues || []).join(', '),
      unit: a.unit || '',
      helpText: a.helpText || '',
      group: a.group || '',
      keySpec: a.keySpec === true,
      keySpecFormat: a.keySpecFormat || '',
      displayOrder: String(a.displayOrder ?? 0),
      min: a.validation?.min !== undefined ? String(a.validation.min) : '',
      max: a.validation?.max !== undefined ? String(a.validation.max) : '',
      pattern: a.validation?.pattern || '',
    });
  };

  const submitAttribute = async () => {
    if (!form || !scope) return;
    setSaving(true);
    setFormError('');
    const body: any = {
      key: form.key,
      label: form.label,
      type: form.type,
      isRequired: form.isRequired,
      isVariantAttribute: form.isVariantAttribute,
      isFilterable: form.isFilterable,
      isSearchable: form.isSearchable,
      allowedValues: form.allowedValues.split(',').map((v) => v.trim()).filter(Boolean),
      unit: form.unit,
      helpText: form.helpText,
      group: form.group,
      keySpec: form.keySpec,
      keySpecFormat: form.keySpecFormat,
      displayOrder: Number(form.displayOrder) || 0,
      isActive: form.id ? attributes.find((x) => x._id === form.id)?.isActive !== false : true,
      validation: { min: form.min, max: form.max, pattern: form.pattern },
    };
    try {
      if (form.id) await updateAttribute(form.id, body);
      else await createAttribute(scope.type, scope.id, body);
      setForm(null);
      showToast('Attribute saved', 'success');
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Could not save the attribute');
    } finally {
      setSaving(false);
    }
  };

  const [optDraft, setOptDraft] = useState<Record<string, string>>({});
  const saveOptions = async (a: AdminAttribute, values: string[], active: boolean = a.isActive !== false) => {
    try {
      await updateAttribute(a._id, {
        key: a.key, label: a.label, type: a.type, isRequired: a.isRequired, isVariantAttribute: a.isVariantAttribute,
        isFilterable: a.isFilterable, isSearchable: a.isSearchable, allowedValues: values, unit: a.unit || '',
        helpText: a.helpText || '', group: a.group || '', keySpec: a.keySpec === true, keySpecFormat: a.keySpecFormat || '',
        displayOrder: a.displayOrder ?? 0, isActive: active,
        validation: { min: a.validation?.min, max: a.validation?.max, pattern: a.validation?.pattern || '' } as any,
      });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not update the options', 'error');
    }
  };
  const addOptionTo = (a: AdminAttribute) => {
    const v = (optDraft[a._id] || '').trim();
    setOptDraft((d) => { const n = { ...d }; delete n[a._id]; return n; });
    if (!v) return;
    const have = a.allowedValues || [];
    if (have.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    saveOptions(a, [...have, v], a.isActive !== false);
  };

  const removeAttribute = async (a: AdminAttribute) => {
    if (!window.confirm(`Delete "${a.label}"? Existing products keep their saved value, but it will no longer be asked for.`)) return;
    try {
      await deleteAttribute(a._id);
      showToast('Attribute deleted', 'success');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not delete', 'error');
    }
  };

  const saveRule = async () => {
    if (!scope) return;
    setSaving(true);
    try {
      const res = await saveListingRule(scope.type, scope.id, rule);
      setRule({ ...res.data, requiredDocs: res.data.requiredDocs || [] });
      showToast('Rules saved', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save the rules', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addDoc = () => {
    const label = docLabel.trim();
    if (!label) return;
    if (rule.requiredDocs.some((d) => d.label.toLowerCase() === label.toLowerCase())) return;
    setRule((r) => ({ ...r, requiredDocs: [...r.requiredDocs, { label }] }));
    setDocLabel('');
  };

  const scopeLabel = () => {
    const parts = [
      headers.find((h) => h._id === headerId)?.name,
      categories.find((c) => c._id === categoryId)?.name,
      subcategories.find((s) => s._id === subcategoryId)?.subcategoryName,
    ].filter(Boolean);
    return parts.join(' › ');
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-6 py-4">
          <h2 className="text-lg font-semibold">Listing Setup</h2>
          <p className="text-sm text-teal-100 mt-1">
            Choose what sellers must fill in for each department or category: extra attributes, the default HSN code, and the documents regulated products need.
            More specific levels add to what the broader ones ask for.
          </p>
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Department</label>
            <select
              className={inputCls}
              value={headerId}
              onChange={(e) => {
                setHeaderId(e.target.value);
                setCategoryId('');
              }}
            >
              <option value="">Select department</option>
              {headers.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name}
                  {h.status !== 'Published' ? ' (unpublished)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Category (optional)</label>
            <select className={inputCls} value={categoryId} disabled={!headerId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Whole department</option>
              {categoriesForHeader.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Subcategory (optional)</label>
            <select className={inputCls} value={subcategoryId} disabled={!categoryId || subcategories.length === 0} onChange={(e) => setSubcategoryId(e.target.value)}>
              <option value="">Whole category</option>
              {subcategories.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.subcategoryName || s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!scope ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center text-neutral-400 text-sm">Pick a department to set up its listing form.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
            <h3 className="text-base font-bold text-neutral-900">Variant Attributes</h3>
            <p className="text-xs text-neutral-500 mb-2">Select attributes and add options to create product variants. Sellers can only pick from these. Applies to: {scopeLabel()}</p>
            {loading ? (
              <div className="p-6 text-center text-neutral-500 text-sm">Loading…</div>
            ) : attributes.filter((a) => a.isVariantAttribute).length === 0 ? (
              <div className="p-6 text-center text-neutral-400 text-sm">No variant attributes at this level yet. Pick a category or sub-category above, or add one below.</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {attributes.filter((a) => a.isVariantAttribute).map((a) => {
                  const on = a.isActive !== false;
                  const colourAttr = /colou?r/i.test(a.label);
                  return (
                    <div key={a._id} className="py-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2.5 w-36 shrink-0 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => saveOptions(a, a.allowedValues || [], !on)} className="w-4 h-4 accent-blue-600" />
                        <span className="leading-tight">
                          <span className={`block text-sm font-semibold ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>{a.label}</span>
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        {(a.allowedValues || []).map((v) => {
                          const css = v.trim().toLowerCase().replace(/\s+/g, '');
                          const isColour = colourAttr && typeof CSS !== 'undefined' && CSS.supports?.('color', css);
                          return (
                            <span key={v} className="relative group">
                              {isColour ? (
                                <span title={v} className="block w-7 h-7 rounded-full border border-neutral-300" style={{ background: css }} />
                              ) : (
                                <span className="block min-w-[40px] text-center px-3 py-1 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700">{v}</span>
                              )}
                              <button type="button" title={'Remove ' + v} aria-label={'Remove ' + v}
                                onClick={() => saveOptions(a, (a.allowedValues || []).filter((x) => x !== v), on)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-800 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100">×</button>
                            </span>
                          );
                        })}
                        {optDraft[a._id] !== undefined && (
                          <input
                            autoFocus
                            value={optDraft[a._id]}
                            onChange={(e) => setOptDraft((d) => ({ ...d, [a._id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); addOptionTo(a); }
                              if (e.key === 'Escape') setOptDraft((d) => { const n = { ...d }; delete n[a._id]; return n; });
                            }}
                            onBlur={() => addOptionTo(a)}
                            placeholder={colourAttr ? 'Colour name, e.g. Maroon' : 'Type and press Enter'}
                            className="w-40 px-2 py-1.5 rounded-lg border border-blue-400 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOptDraft((d) => ({ ...d, [a._id]: d[a._id] ?? '' }))}
                          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-xs font-semibold min-w-[110px] justify-center ${on ? 'border-blue-300 text-blue-700 hover:bg-blue-50' : 'border-neutral-200 text-neutral-400'}`}>
                          + Add {colourAttr ? 'Color' : a.label.length > 10 ? 'Option' : a.label}
                        </button>
                        <button onClick={() => openEdit(a)} className="text-blue-700 text-xs font-semibold hover:underline">Edit</button>
                        <button onClick={() => removeAttribute(a)} className="text-red-600 text-xs font-semibold hover:underline">Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setFormError('');
                  setForm({ ...emptyForm(), type: 'select', isVariantAttribute: true });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-semibold bg-white"
              >
                + Add Custom Attribute
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  const live = attributes.filter((a) => a.isVariantAttribute && a.isActive !== false && (a.allowedValues || []).length > 0);
                  const n = live.reduce((t, a) => t * (a.allowedValues || []).length, 1);
                  showToast(live.length ? `Sellers can create up to ${n} combinations (${live.map((a) => a.label).join(' × ')}) on the product page.` : 'Tick at least one attribute that has options.', live.length ? 'success' : 'error');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
              >
                Generate Variants
              </button>
              <span className="text-[11px] text-neutral-500">(Will create all possible combinations)</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-800">Attributes</h3>
                <p className="text-xs text-neutral-500">Applies to: {scopeLabel()}</p>
              </div>
              <button
                onClick={() => {
                  setFormError('');
                  setForm(emptyForm());
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg"
              >
                Add attribute
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-neutral-500 text-sm">Loading…</div>
            ) : attributes.filter((a) => !a.isVariantAttribute).length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">No attributes set at this level yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-700 border-b border-neutral-200">
                      <th className="p-3">Label</th>
                      <th className="p-3">Section</th>
                      <th className="p-3">Key</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Rules</th>
                      <th className="p-3">Values</th>
                      <th className="p-3 w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attributes.filter((a) => !a.isVariantAttribute).map((a) => (
                      <tr key={a._id} className="border-b border-neutral-100">
                        <td className="p-3 font-medium text-neutral-800">
                          {a.label}
                          {a.unit ? <span className="text-neutral-400"> ({a.unit})</span> : null}
                        </td>
                        <td className="p-3 text-xs text-neutral-600">{a.group || '—'}</td>
                        <td className="p-3 font-mono text-xs text-neutral-500">{a.key}</td>
                        <td className="p-3 text-neutral-600">{TYPES.find((t) => t.value === a.type)?.label}</td>
                        <td className="p-3 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {a.isRequired && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Required</span>}
                            {a.isVariantAttribute && <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">Variant</span>}
                            {a.isFilterable && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Filter</span>}
                            {a.keySpec && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Key spec</span>}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-neutral-500 max-w-[220px] truncate">{(a.allowedValues || []).join(', ') || '—'}</td>
                        <td className="p-3">
                          <button onClick={() => openEdit(a)} className="text-teal-700 text-xs font-semibold mr-3 hover:underline">
                            Edit
                          </button>
                          <button onClick={() => removeAttribute(a)} className="text-red-600 text-xs font-semibold hover:underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
            <div className="px-6 py-4 border-b border-neutral-200">
              <h3 className="text-base font-semibold text-neutral-800">Rules</h3>
              <p className="text-xs text-neutral-500">Applies to: {scopeLabel()}</p>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Default HSN code</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={8}
                  value={rule.defaultHsn || ''}
                  onChange={(e) => setRule((r) => ({ ...r, defaultHsn: e.target.value.replace(/\D/g, '') }))}
                  placeholder="4, 6 or 8 digits"
                />
                <p className="text-[11px] text-neutral-500 mt-1">Pre-filled for sellers. Confirm real codes with your CA.</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-neutral-800">
                <input type="checkbox" className="mt-1" checked={rule.isRegulated} onChange={(e) => setRule((r) => ({ ...r, isRegulated: e.target.checked }))} />
                <span>
                  <span className="font-semibold">Regulated category</span>
                  <span className="block text-xs text-neutral-500">Sellers must upload the documents below, and you must verify them before a product can go live.</span>
                </span>
              </label>
              {rule.isRegulated && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Required documents</label>
                  <div className="flex gap-2 max-w-md">
                    <input
                      className={inputCls}
                      value={docLabel}
                      onChange={(e) => setDocLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDoc();
                        }
                      }}
                      placeholder="e.g. FSSAI licence, Trade licence"
                    />
                    <button type="button" onClick={addDoc} className="px-4 rounded-lg bg-teal-600 text-white text-sm font-medium">
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {rule.requiredDocs.map((d) => (
                      <span key={d.label} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-100 text-xs font-semibold">
                        {d.label}
                        <button type="button" onClick={() => setRule((r) => ({ ...r, requiredDocs: r.requiredDocs.filter((x) => x.label !== d.label) }))} className="text-neutral-500">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={saveRule} disabled={saving} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : 'Save rules'}
              </button>
            </div>
          </div>
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
              <h3 className="text-lg font-semibold">{form.id ? 'Edit attribute' : 'Add attribute'}</h3>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{formError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Label</label>
                  <input
                    className={inputCls}
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value, key: form.id ? form.key : slug(e.target.value) })}
                    placeholder="e.g. Screen size"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Key</label>
                  <input className={inputCls} value={form.key} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, key: slug(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Type</label>
                  <select
                    className={inputCls}
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value as AttributeType;
                      setForm({ ...form, type, isVariantAttribute: type === 'select' ? form.isVariantAttribute : false });
                    }}
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Unit (optional)</label>
                  <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="g, cm, W…" />
                </div>
              </div>
              {(form.type === 'select' || form.type === 'multiselect') && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Allowed values (comma separated)</label>
                  <textarea rows={2} className={inputCls} value={form.allowedValues} onChange={(e) => setForm({ ...form, allowedValues: e.target.value })} placeholder="S, M, L, XL" />
                </div>
              )}
              {form.type === 'number' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Minimum</label>
                    <input type="number" className={inputCls} value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Maximum</label>
                    <input type="number" className={inputCls} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
                  </div>
                </div>
              )}
              {form.type === 'text' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Format pattern (optional regular expression)</label>
                  <input className={inputCls} value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="^[0-9]{10}$" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Section on the product page</label>
                <input
                  className={inputCls}
                  list="spec-groups"
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  placeholder="e.g. Display, Rear Camera, Battery"
                />
                <datalist id="spec-groups">
                  {Array.from(new Set(attributes.map((a) => a.group).filter(Boolean) as string[])).map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
                <p className="text-[11px] text-neutral-500 mt-1">Attributes with the same section name are listed together. Sections appear in the order of their first attribute.</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input type="checkbox" checked={form.keySpec} disabled={form.isVariantAttribute} onChange={(e) => setForm({ ...form, keySpec: e.target.checked })} />
                  Show in the "Key specs" summary
                </label>
                {form.keySpec && (
                  <div className="mt-2">
                    <input
                      className={inputCls}
                      value={form.keySpecFormat}
                      onChange={(e) => setForm({ ...form, keySpecFormat: e.target.value })}
                      placeholder='Wording, e.g. "{value} RAM" (default: "Label: value")'
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">Use {'{value}'} where the seller's value goes. The unit is added to the value automatically.</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Help text (shown to the seller)</label>
                <input className={inputCls} value={form.helpText} onChange={(e) => setForm({ ...form, helpText: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-neutral-800">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} /> Required
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isFilterable} onChange={(e) => setForm({ ...form, isFilterable: e.target.checked })} /> Filterable
                </label>
                <label className={`flex items-center gap-2 ${form.type === 'select' ? '' : 'opacity-40'}`}>
                  <input type="checkbox" disabled={form.type !== 'select'} checked={form.isVariantAttribute} onChange={(e) => setForm({ ...form, isVariantAttribute: e.target.checked })} /> Variant option
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isSearchable} onChange={(e) => setForm({ ...form, isSearchable: e.target.checked })} /> Searchable
                </label>
              </div>
              <div className="w-28">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Display order</label>
                <input type="number" className={inputCls} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium">
                Cancel
              </button>
              <button onClick={submitAttribute} disabled={saving} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : 'Save attribute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
