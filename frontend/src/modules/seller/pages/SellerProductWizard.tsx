import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { uploadImage, uploadImages } from '../../../services/api/uploadService';
import { compressImage, createImagePreview, validateImageFile } from '../../../utils/imageUpload';
import { getProductById, getAllowedHeaderCategories } from '../../../services/api/productService';
import { getCategories, getSubcategories, getSubSubCategories } from '../../../services/api/categoryService';
import { getBrands, Brand } from '../../../services/api/brandService';
import { getActiveTaxes } from '../../../services/api/taxService';
import { useToast } from '../../../context/ToastContext';
import {
  ComplianceDoc,
  ListingConfig,
  createDraft,
  deleteComplianceDoc,
  getComplianceDocUrl,
  getListingConfig,
  listingErrorMessage,
  saveListing,
  submitListing,
  uploadComplianceDoc,
} from '../../../services/api/sellerListingService';

type StepKey = 'category' | 'basic' | 'attributes' | 'variants' | 'price' | 'shipping' | 'review';
const STEPS: { key: StepKey; title: string }[] = [
  { key: 'category', title: 'Category' },
  { key: 'basic', title: 'Basic details' },
  { key: 'attributes', title: 'Attributes' },
  { key: 'variants', title: 'Variants' },
  { key: 'price', title: 'Price & stock' },
  { key: 'shipping', title: 'Shipping' },
  { key: 'review', title: 'Review' },
];

interface VariationRow {
  title: string;
  price: string;
  discPrice: string;
  stock: string;
  sku: string;
  images: string[];
}

const MAX_OPTION_PHOTOS = 8;
const emptyRow = (title = ''): VariationRow => ({ title, price: '', discPrice: '', stock: '0', sku: '', images: [] });

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-neutral-50';
const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

const idOf = (v: any): string => (v && typeof v === 'object' ? v._id || '' : v || '');
const nameOf = (v: any) => v?.name || v?.subcategoryName || v?.subSubCategoryName || '';

export default function SellerProductWizard() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { showToast } = useToast();

  const [productId, setProductId] = useState<string | undefined>(routeId);
  const [step, setStep] = useState<StepKey>('category');
  const [loading, setLoading] = useState(Boolean(routeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionPending, setRevisionPending] = useState(false);

  // Category
  const [headerCategories, setHeaderCategories] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [subSubCategories, setSubSubCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [headerCategory, setHeaderCategory] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');

  // Basic
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<'New' | 'Used' | 'Refurbished'>('New');
  const [modelNumber, setModelNumber] = useState('');
  const [barcode, setBarcode] = useState('');
  const [smallDescription, setSmallDescription] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [madeIn, setMadeIn] = useState('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // Attributes
  const [config, setConfig] = useState<ListingConfig | null>(null);
  const [attributes, setAttributes] = useState<Record<string, any>>({});

  // Variants / price
  const [variationMode, setVariationMode] = useState<string>('none'); // 'none' | attribute key | 'custom'
  const [rows, setRows] = useState<VariationRow[]>([emptyRow('Default')]);
  const [customTitle, setCustomTitle] = useState('');
  const [taxId, setTaxId] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [handlingTimeDays, setHandlingTimeDays] = useState('1');

  // Shipping
  const [weightGrams, setWeightGrams] = useState('');
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [isReturnable, setIsReturnable] = useState(true);
  const [maxReturnDays, setMaxReturnDays] = useState('');

  // Compliance
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const variantAttributes = useMemo(() => (config?.attributes || []).filter((a) => a.isVariantAttribute), [config]);
  const hasValue = (v: any) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
  // Sections follow the order of their first attribute, matching the product page.
  const attributeSections = useMemo(() => {
    const sections = new Map<string, ListingConfig['attributes']>();
    (config?.attributes || [])
      .filter((a) => !a.isVariantAttribute)
      .forEach((a) => {
        const title = (a.group || '').trim() || 'Details';
        sections.set(title, [...(sections.get(title) || []), a]);
      });
    return [...sections.entries()].map(([title, attrs]) => ({ title, attrs }));
  }, [config]);
  const requiresShipping = config?.seller.requiresShipping === true;
  const needsHsn = config?.seller.gstRegistered === true;

  // ── Loading ──
  useEffect(() => {
    (async () => {
      const [cats, brandRes, headerRes, taxRes] = await Promise.allSettled([getCategories(), getBrands(), getAllowedHeaderCategories(), getActiveTaxes()]);
      if (cats.status === 'fulfilled' && cats.value.success) setAllCategories(cats.value.data as any[]);
      if (brandRes.status === 'fulfilled' && brandRes.value.success) setBrands(brandRes.value.data);
      if (headerRes.status === 'fulfilled') {
        const h: any = headerRes.value;
        if (h?.success && Array.isArray(h.data)) setHeaderCategories(h.data);
        else if (Array.isArray(h)) setHeaderCategories(h.filter((x: any) => x.status === 'Published'));
      }
      if (taxRes.status === 'fulfilled' && (taxRes.value as any)?.success) setTaxes((taxRes.value as any).data || []);
    })();
  }, []);

  const applyProduct = useCallback((p: any) => {
    setStatus(p.status || '');
    setRejectionReason(p.rejectionReason || '');
    setRevisionPending(Boolean(p.revisionPending));
    setHeaderCategory(idOf(p.headerCategoryId));
    setCategory(idOf(p.category));
    setSubcategory(idOf(p.subcategory));
    setSubSubCategory(idOf(p.subSubCategory));
    setProductName(p.productName || '');
    setBrand(idOf(p.brand));
    setCondition(p.condition || 'New');
    setModelNumber(p.modelNumber || '');
    setBarcode(p.barcode || '');
    setSmallDescription(p.smallDescription || '');
    setManufacturer(p.manufacturer || '');
    setMadeIn(p.madeIn || '');
    setMainImageUrl(p.mainImage || p.mainImageUrl || '');
    setMainPreview(p.mainImage || p.mainImageUrl || '');
    setGalleryUrls(p.galleryImages || []);
    setGalleryPreviews(p.galleryImages || []);
    setGalleryFiles([]);
    setMainImageFile(null);
    setAttributes(p.attributes || {});
    setTaxId(idOf(p.tax));
    setHsnCode(p.hsnCode || '');
    setHandlingTimeDays(p.handlingTimeDays !== undefined && p.handlingTimeDays !== null ? String(p.handlingTimeDays) : '1');
    setWeightGrams(p.weightGrams ? String(p.weightGrams) : '');
    setDimL(p.dimensionsCm?.length ? String(p.dimensionsCm.length) : '');
    setDimW(p.dimensionsCm?.width ? String(p.dimensionsCm.width) : '');
    setDimH(p.dimensionsCm?.height ? String(p.dimensionsCm.height) : '');
    setIsReturnable(p.isReturnable !== false);
    setMaxReturnDays(p.maxReturnDays ? String(p.maxReturnDays) : '');
    setDocs(p.complianceDocs || []);
    const vs: any[] = p.variations || [];
    if (vs.length === 0 || (vs.length === 1 && /^default$/i.test(vs[0].value || vs[0].title || 'Default'))) {
      setVariationMode('none');
      setRows([
        vs.length
          ? { title: 'Default', price: String(vs[0].price ?? ''), discPrice: vs[0].discPrice ? String(vs[0].discPrice) : '', stock: String(vs[0].stock ?? 0), sku: vs[0].sku || '', images: vs[0].images || [] }
          : emptyRow('Default'),
      ]);
    } else {
      setVariationMode(p.variationType ? `type:${p.variationType}` : 'custom');
      setRows(
        vs.map((v) => ({
          title: v.value || v.title || '',
          price: String(v.price ?? ''),
          discPrice: v.discPrice ? String(v.discPrice) : '',
          stock: String(v.stock ?? 0),
          sku: v.sku || '',
          images: v.images || [],
        }))
      );
    }
  }, []);

  useEffect(() => {
    if (!routeId) return;
    (async () => {
      try {
        const res = await getProductById(routeId);
        if (res.success && res.data) applyProduct(res.data);
      } catch (err) {
        setError(listingErrorMessage(err, 'Failed to load the product'));
      } finally {
        setLoading(false);
      }
    })();
  }, [routeId, applyProduct]);

  // Category lists follow the selections
  useEffect(() => {
    if (!category) {
      setSubcategories([]);
      return;
    }
    getSubcategories(category)
      .then((r) => r.success && setSubcategories(r.data as any[]))
      .catch(() => setSubcategories([]));
  }, [category]);

  useEffect(() => {
    if (!subcategory) {
      setSubSubCategories([]);
      return;
    }
    getSubSubCategories(subcategory)
      .then((r) => r.success && setSubSubCategories(r.data as any[]))
      .catch(() => setSubSubCategories([]));
  }, [subcategory]);

  // Attributes & rules follow the category branch
  useEffect(() => {
    if (!headerCategory && !category) {
      setConfig(null);
      return;
    }
    getListingConfig({ headerCategoryId: headerCategory, categoryId: category, subcategoryId: subcategory, subSubCategoryId: subSubCategory })
      .then((r) => {
        if (r.success) {
          setConfig(r.data);
          setHsnCode((current) => current || r.data.rule.defaultHsn || '');
        }
      })
      .catch(() => setConfig(null));
  }, [headerCategory, category, subcategory, subSubCategory]);

  // Resolve 'type:<label>' once the attributes have loaded
  useEffect(() => {
    if (variationMode.startsWith('type:') && config) {
      const label = variationMode.slice(5);
      const match = variantAttributes.find((a) => a.label === label);
      setVariationMode(match ? match.key : 'custom');
    }
  }, [variationMode, variantAttributes, config]);

  const categoriesForHeader = useMemo(
    () => allCategories.filter((c) => !headerCategory || idOf(c.headerCategoryId) === headerCategory),
    [allCategories, headerCategory]
  );

  // ── Derived readiness ──
  const variationProblems = (): string[] => {
    const problems: string[] = [];
    if (rows.length === 0) problems.push('Add at least one variation');
    rows.forEach((r) => {
      const label = r.title || 'variation';
      const price = Number(r.price);
      if (!(price > 0)) problems.push(`MRP for "${label}"`);
      else if (r.discPrice && Number(r.discPrice) > price) problems.push(`Selling price for "${label}" can't exceed its MRP`);
      if (r.stock !== '' && Number(r.stock) < 0) problems.push(`Stock for "${label}"`);
    });
    return problems;
  };

  const readiness = useMemo(() => {
    const missing: { label: string; step: StepKey }[] = [];
    if (!productName.trim()) missing.push({ label: 'Product name', step: 'basic' });
    if (!category) missing.push({ label: 'Category', step: 'category' });
    if (!mainImageUrl && !mainImageFile) missing.push({ label: 'Main product image', step: 'basic' });
    (config?.attributes || []).forEach((a) => {
      const v = attributes[a.key];
      if (a.isRequired && (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))) {
        missing.push({ label: `Attribute: ${a.label}`, step: 'attributes' });
      }
    });
    variationProblems().forEach((label) => missing.push({ label, step: 'price' }));
    if (needsHsn && !hsnCode.trim()) missing.push({ label: 'HSN code', step: 'price' });
    if (requiresShipping) {
      if (!(Number(weightGrams) > 0)) missing.push({ label: 'Package weight', step: 'shipping' });
      if (!(Number(dimL) > 0 && Number(dimW) > 0 && Number(dimH) > 0)) missing.push({ label: 'Package dimensions', step: 'shipping' });
    }
    (config?.rule.requiredDocs || []).forEach((d) => {
      const doc = docs.find((x) => x.docType === d.key);
      if (!doc) missing.push({ label: `Document: ${d.label}`, step: 'review' });
      else if (doc.status === 'Rejected') missing.push({ label: `Document: ${d.label} (rejected, upload a new one)`, step: 'review' });
    });
    return missing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, category, mainImageUrl, mainImageFile, config, attributes, rows, needsHsn, hsnCode, requiresShipping, weightGrams, dimL, dimW, dimH, docs]);

  const stepDone = (key: StepKey): boolean => {
    switch (key) {
      case 'category':
        return Boolean(category);
      case 'basic':
        return Boolean(productName.trim() && (mainImageUrl || mainImageFile));
      case 'attributes':
        return !readiness.some((m) => m.step === 'attributes');
      case 'variants':
        return rows.length > 0 && rows.every((r) => r.title.trim());
      case 'price':
        return !readiness.some((m) => m.step === 'price');
      case 'shipping':
        return !readiness.some((m) => m.step === 'shipping');
      default:
        return readiness.length === 0;
    }
  };

  // ── Step handlers ──
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const goTo = (key: StepKey) => {
    setError('');
    setStep(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => goTo(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
  const back = () => goTo(STEPS[Math.max(stepIndex - 1, 0)].key);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (err) {
      setError(listingErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const categoryScope = () => ({
    headerCategoryId: headerCategory || undefined,
    categoryId: category || undefined,
    subcategoryId: subcategory || undefined,
    subSubCategoryId: subSubCategory || undefined,
  });

  const onNextCategory = async () => {
    if (!category) return setError('Select a category to continue.');
    if (!productId) return next();
    const ok = await run(async () => {
      const res = await saveListing(productId, categoryScope());
      applyServerMessage(res.message);
    });
    if (ok) next();
  };

  const applyServerMessage = (message?: string) => {
    if (message && /awaiting review/i.test(message)) {
      setRevisionPending(true);
      showToast(message, 'info');
    }
  };

  const uploadPendingImages = async () => {
    let main = mainImageUrl;
    let gallery = [...galleryUrls];
    if (mainImageFile) {
      const r = await uploadImage(await compressImage(mainImageFile), 'exnshop/products');
      main = r.secureUrl;
      setMainImageUrl(main);
      setMainImageFile(null);
    }
    if (galleryFiles.length) {
      const compressed = await Promise.all(galleryFiles.map((f) => compressImage(f)));
      const results = await uploadImages(compressed, 'exnshop/products/gallery');
      gallery = [...gallery, ...results.map((r) => r.secureUrl)];
      setGalleryUrls(gallery);
      setGalleryFiles([]);
    }
    return { main, gallery };
  };

  const onNextBasic = async () => {
    if (!productName.trim()) return setError('Enter a product name.');
    if (!mainImageUrl && !mainImageFile) return setError('Upload a main product image.');
    const ok = await run(async () => {
      const { main, gallery } = await uploadPendingImages();
      const basics = {
        productName: productName.trim(),
        ...categoryScope(),
        brandId: brand || undefined,
        condition,
        modelNumber,
        barcode,
        smallDescription: smallDescription || undefined,
        manufacturer: manufacturer || undefined,
        madeIn: madeIn || undefined,
        mainImageUrl: main,
        galleryImageUrls: gallery,
      };
      if (!productId) {
        const created = await createDraft({ productName: basics.productName, ...categoryScope(), brandId: brand || undefined });
        const newId = created.data._id as string;
        setProductId(newId);
        setStatus('Draft');
        window.history.replaceState(null, '', `/seller/product/edit/${newId}`);
        const res = await saveListing(newId, basics);
        applyServerMessage(res.message);
      } else {
        const res = await saveListing(productId, basics);
        applyServerMessage(res.message);
      }
    });
    if (ok) next();
  };

  const onNextAttributes = async () => {
    if (!productId) return;
    const ok = await run(async () => {
      const res = await saveListing(productId, { attributes });
      applyServerMessage(res.message);
    });
    if (ok) next();
  };

  const onNextVariants = async () => {
    if (rows.some((r) => !r.title.trim())) return setError('Every variation needs a name.');
    if (variationMode !== 'none' && rows.length === 0) return setError('Choose or add at least one variation.');
    next();
  };

  const onNextPrice = async () => {
    if (!productId) return;
    const problems = variationProblems();
    if (problems.length) return setError(`Fix: ${problems.join(', ')}.`);
    if (needsHsn && !hsnCode.trim()) return setError('Enter the HSN code for this product.');
    const ok = await run(async () => {
      const typeLabel = variantAttributes.find((a) => a.key === variationMode)?.label;
      const res = await saveListing(productId, {
        variationType: variationMode === 'none' ? '' : typeLabel || 'Other',
        variations: rows.map((r) => ({
          title: variationMode === 'none' ? 'Default' : r.title.trim(),
          price: Number(r.price),
          discPrice: r.discPrice ? Number(r.discPrice) : 0,
          stock: Number(r.stock || 0),
          ...(r.sku.trim() ? { sku: r.sku.trim() } : {}),
          // Only options (not the single default) carry their own photos.
          images: variationMode === 'none' ? [] : r.images,
          status: 'Available',
        })),
        taxId: taxId || undefined,
        hsnCode,
        handlingTimeDays,
      });
      applyServerMessage(res.message);
      const fresh = await getProductById(productId);
      if (fresh.success && fresh.data) setRowsFromServer(fresh.data);
    });
    if (ok) next();
  };

  const setRowsFromServer = (p: any) => {
    const vs: any[] = p.variations || [];
    if (!vs.length) return;
    setRows(vs.map((v) => ({ title: v.value || v.title || '', price: String(v.price ?? ''), discPrice: v.discPrice ? String(v.discPrice) : '', stock: String(v.stock ?? 0), sku: v.sku || '', images: v.images || [] })));
  };

  const onNextShipping = async () => {
    if (!productId) return;
    if (requiresShipping && (!(Number(weightGrams) > 0) || !(Number(dimL) > 0 && Number(dimW) > 0 && Number(dimH) > 0))) {
      return setError('Enter the package weight and its length, width and height — couriers need them.');
    }
    const ok = await run(async () => {
      const res = await saveListing(productId, {
        weightGrams,
        dimensionsCm: { length: dimL, width: dimW, height: dimH },
        isReturnable,
        maxReturnDays: isReturnable && maxReturnDays ? parseInt(maxReturnDays, 10) : undefined,
      });
      applyServerMessage(res.message);
    });
    if (ok) next();
  };

  const onSubmit = async () => {
    if (!productId) return;
    if (readiness.length) return setError(`Still needed: ${readiness.map((m) => m.label).join(', ')}.`);
    const ok = await run(async () => {
      await submitListing(productId);
    });
    if (ok) {
      showToast('Submitted for review. You\'ll be notified once it is approved.', 'success');
      navigate('/seller/product/list');
    }
  };

  // ── Images ──
  const onMainImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.valid) return setError(v.error || 'Invalid image');
    setMainImageFile(file);
    setMainPreview(await createImagePreview(file));
    setError('');
  };
  const onGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.some((f) => !validateImageFile(f).valid)) return setError('Some images are invalid. Check the file types and sizes.');
    setGalleryFiles((p) => [...p, ...files]);
    const previews = await Promise.all(files.map((f) => createImagePreview(f)));
    setGalleryPreviews((p) => [...p, ...previews]);
    setError('');
  };
  const removeGallery = (index: number) => {
    setGalleryPreviews((p) => p.filter((_, i) => i !== index));
    if (index < galleryUrls.length) setGalleryUrls((p) => p.filter((_, i) => i !== index));
    else setGalleryFiles((p) => p.filter((_, i) => i !== index - galleryUrls.length));
  };

  // ── Compliance ──
  const onDocUpload = async (docType: string, file?: File) => {
    if (!file || !productId) return;
    setUploadingDoc(docType);
    try {
      const res = await uploadComplianceDoc(productId, docType, file);
      setDocs(res.data);
      showToast('Document uploaded', 'success');
    } catch (err) {
      showToast(listingErrorMessage(err, 'Upload failed'), 'error');
    } finally {
      setUploadingDoc(null);
    }
  };
  const onDocView = async (docId: string) => {
    if (!productId) return;
    const tab = window.open('', '_blank');
    try {
      const res = await getComplianceDocUrl(productId, docId);
      if (tab) tab.location.href = res.data.url;
    } catch (err) {
      tab?.close();
      showToast(listingErrorMessage(err, 'Could not open document'), 'error');
    }
  };
  const onDocDelete = async (docId: string) => {
    if (!productId) return;
    try {
      const res = await deleteComplianceDoc(productId, docId);
      setDocs(res.data);
    } catch (err) {
      showToast(listingErrorMessage(err, 'Could not remove document'), 'error');
    }
  };

  // ── Variants helpers ──
  const chooseMode = (mode: string) => {
    setVariationMode(mode);
    setError('');
    if (mode === 'none') setRows([{ ...(rows[0] || emptyRow('Default')), title: 'Default' }]);
    else setRows([]);
  };
  const toggleValue = (value: string) =>
    setRows((current) => (current.some((r) => r.title === value) ? current.filter((r) => r.title !== value) : [...current, emptyRow(value)]));
  const addCustom = () => {
    const t = customTitle.trim();
    if (!t) return;
    if (rows.some((r) => r.title.toLowerCase() === t.toLowerCase())) return setError(`"${t}" is already added.`);
    setRows((c) => [...c, emptyRow(t)]);
    setCustomTitle('');
    setError('');
  };
  const updateRow = (index: number, patch: Partial<VariationRow>) => setRows((c) => c.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const [uploadingRow, setUploadingRow] = useState<number | null>(null);
  const onOptionPhotos = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.some((f) => !validateImageFile(f).valid)) return setError('Some photos are invalid. Check the file types and sizes.');
    const room = MAX_OPTION_PHOTOS - (rows[index]?.images.length || 0);
    if (room <= 0) return setError(`Each option can have up to ${MAX_OPTION_PHOTOS} photos.`);
    setUploadingRow(index);
    setError('');
    try {
      const compressed = await Promise.all(files.slice(0, room).map((f) => compressImage(f)));
      const results = await uploadImages(compressed, 'exnshop/products/options');
      setRows((c) => c.map((r, i) => (i === index ? { ...r, images: [...r.images, ...results.map((x) => x.secureUrl)] } : r)));
    } catch (err) {
      setError(listingErrorMessage(err, 'Photo upload failed'));
    } finally {
      setUploadingRow(null);
    }
  };

  const isApproved = status === 'Active' || status === 'Inactive';
  const canSubmit = !productId ? false : status === 'Draft' || status === 'Rejected' || status === '';

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  const attributeInput = (a: ListingConfig['attributes'][number]) => {
    const value = attributes[a.key];
    const set = (v: any) => setAttributes((p) => ({ ...p, [a.key]: v }));
    switch (a.type) {
      case 'select':
        return (
          <select className={inputCls} value={value || ''} onChange={(e) => set(e.target.value)}>
            <option value="">Select</option>
            {a.allowedValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
      case 'multiselect':
        return (
          <div className="flex flex-wrap gap-2">
            {a.allowedValues.map((v) => {
              const on = Array.isArray(value) && value.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => set(on ? value.filter((x: string) => x !== v) : [...(Array.isArray(value) ? value : []), v])}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${on ? 'bg-teal-50 border-teal-500 text-teal-800' : 'bg-white border-neutral-300 text-neutral-600'}`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        );
      case 'boolean':
        return (
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((b) => (
              <button
                key={String(b)}
                type="button"
                onClick={() => set(b)}
                className={`py-2.5 rounded-xl border text-sm font-semibold ${value === b ? 'bg-teal-50 border-teal-500 text-teal-800' : 'bg-white border-neutral-300 text-neutral-600'}`}
              >
                {b ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        );
      case 'number':
        return (
          <div className="flex items-center gap-2">
            <input type="number" className={inputCls} value={value ?? ''} onChange={(e) => set(e.target.value)} />
            {a.unit && <span className="text-xs text-neutral-500">{a.unit}</span>}
          </div>
        );
      case 'date':
        return <input type="date" className={inputCls} value={value || ''} onChange={(e) => set(e.target.value)} />;
      default:
        return <input className={inputCls} value={value || ''} onChange={(e) => set(e.target.value)} />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-neutral-900">{routeId ? 'Edit product' : 'Add a product'}</h1>
        <Link to={routeId ? `/seller/product/edit-classic/${routeId}` : '/seller/product/add-classic'} className="text-xs text-neutral-500 hover:underline">
          Use the classic form
        </Link>
      </div>

      {status === 'Rejected' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5 text-sm text-orange-900">
          <p className="font-semibold">Changes needed</p>
          <p className="text-xs mt-0.5">{rejectionReason || 'The reviewer asked for changes.'}</p>
          <p className="text-xs mt-0.5">Fix it below, then submit it for review again from the last step.</p>
        </div>
      )}
      {status === 'Pending' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900">This product is awaiting admin review. You can still make changes.</div>
      )}
      {isApproved && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-700">
          This product is approved. Changes to its name, images, category, brand or attributes are sent for review while the approved version stays live; price, stock and shipping apply right away.
        </div>
      )}
      {revisionPending && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-3.5 text-xs text-purple-900">Your edits to the listing details are awaiting admin review.</div>
      )}

      <div className="bg-white rounded-2xl border border-neutral-200 p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1">
          {STEPS.map((s, i) => {
            const active = step === s.key;
            const reachable = Boolean(productId) || i <= stepIndex;
            const done = stepDone(s.key) && i < stepIndex + (productId ? STEPS.length : 0);
            return (
              <button
                key={s.key}
                type="button"
                disabled={!reachable}
                onClick={() => goTo(s.key)}
                className={`rounded-xl px-1 py-2 text-center border transition-colors ${active ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:bg-neutral-50'} disabled:opacity-50`}
              >
                <span
                  className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    done && !active ? 'bg-teal-600 text-white' : active ? 'bg-teal-100 text-teal-800' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {done && !active ? '✓' : i + 1}
                </span>
                <span className="block text-[10px] sm:text-[11px] font-semibold text-neutral-800 leading-tight">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <section className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-6 space-y-4">
        {step === 'category' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Choose the category</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Department" required>
                <select
                  className={inputCls}
                  value={headerCategory}
                  onChange={(e) => {
                    setHeaderCategory(e.target.value);
                    setCategory('');
                    setSubcategory('');
                    setSubSubCategory('');
                  }}
                >
                  <option value="">Select department</option>
                  {headerCategories.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category" required>
                <select
                  className={inputCls}
                  value={category}
                  disabled={!headerCategory}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubcategory('');
                    setSubSubCategory('');
                  }}
                >
                  <option value="">Select category</option>
                  {categoriesForHeader.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategory">
                <select
                  className={inputCls}
                  value={subcategory}
                  disabled={!category || subcategories.length === 0}
                  onChange={(e) => {
                    setSubcategory(e.target.value);
                    setSubSubCategory('');
                  }}
                >
                  <option value="">{subcategories.length ? 'Select subcategory' : 'None available'}</option>
                  {subcategories.map((s) => (
                    <option key={s._id} value={s._id}>
                      {nameOf(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Product type">
                <select className={inputCls} value={subSubCategory} disabled={!subcategory || subSubCategories.length === 0} onChange={(e) => setSubSubCategory(e.target.value)}>
                  <option value="">{subSubCategories.length ? 'Select product type' : 'None available'}</option>
                  {subSubCategories.map((s) => (
                    <option key={s._id} value={s._id}>
                      {nameOf(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {config?.rule.isRegulated && (
              <p className="text-xs rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3">
                This is a regulated category. You'll need to upload: {config.rule.requiredDocs.map((d) => d.label).join(', ')}. The product goes live only after those are verified.
              </p>
            )}
          </>
        )}

        {step === 'basic' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Basic details</h2>
            <Field label="Product title" required hint="Be specific: brand, type and key feature help buyers find it.">
              <input className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={150} placeholder="e.g. Men's Cotton Round-Neck T-Shirt" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Brand">
                <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">No brand / Generic</option>
                  {brands.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Condition">
                <div className="grid grid-cols-3 gap-2">
                  {(['New', 'Used', 'Refurbished'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCondition(c)}
                      className={`py-2.5 rounded-xl border text-xs font-semibold ${condition === c ? 'bg-teal-50 border-teal-500 text-teal-800 ring-1 ring-teal-500' : 'bg-white border-neutral-300 text-neutral-600'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Model number">
                <input className={inputCls} value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} maxLength={80} />
              </Field>
              <Field label="Barcode / GTIN" hint="Optional, 4–20 letters or digits">
                <input className={inputCls} value={barcode} onChange={(e) => setBarcode(e.target.value.trim())} maxLength={20} />
              </Field>
              <Field label="Manufacturer">
                <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
              </Field>
              <Field label="Made in">
                <input className={inputCls} value={madeIn} onChange={(e) => setMadeIn(e.target.value)} />
              </Field>
            </div>
            <Field label="Description" hint="Features and specifications buyers care about">
              <textarea rows={4} className={inputCls} value={smallDescription} onChange={(e) => setSmallDescription(e.target.value)} />
            </Field>

            <Field label="Main image" required>
              <div className="flex items-center gap-3">
                <div className="w-24 h-24 rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center">
                  {mainPreview ? <img src={mainPreview} alt="Main" className="w-full h-full object-cover" /> : <span className="text-[11px] text-neutral-400">No image</span>}
                </div>
                <label className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 cursor-pointer">
                  {mainPreview ? 'Replace' : 'Upload image'}
                  <input type="file" accept="image/*" className="hidden" onChange={onMainImage} />
                </label>
              </div>
            </Field>
            <Field label="More images" hint="Different angles help buyers decide.">
              <div className="flex flex-wrap gap-3">
                {galleryPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl border border-neutral-200 overflow-hidden">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeGallery(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none">
                      ×
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-2xl cursor-pointer hover:bg-neutral-50">
                  +
                  <input type="file" accept="image/*" multiple className="hidden" onChange={onGallery} />
                </label>
              </div>
            </Field>
          </>
        )}

        {step === 'attributes' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Category-specific attributes</h2>
            {(config?.attributes || []).filter((a) => !a.isVariantAttribute).length === 0 ? (
              <p className="text-sm text-neutral-500">This category doesn't ask for any extra details. Continue to the next step.</p>
            ) : (
              <div className="space-y-5">
                {attributeSections.map((section) => (
                  <div key={section.title} className="rounded-xl border border-neutral-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-800">{section.title}</h3>
                      <span className="text-[11px] text-neutral-500">
                        {section.attrs.filter((a) => hasValue(attributes[a.key])).length} of {section.attrs.length} filled
                      </span>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {section.attrs.map((a) => (
                        <Field key={a.key} label={a.unit ? `${a.label} (${a.unit})` : a.label} required={a.isRequired} hint={a.helpText}>
                          {attributeInput(a)}
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {variantAttributes.length > 0 && <p className="text-xs text-neutral-500">{variantAttributes.map((a) => a.label).join(', ')} are chosen in the Variants step.</p>}
          </>
        )}

        {step === 'variants' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Variants</h2>
            <Field label="Does this product come in different options?">
              <div className="space-y-2">
                {[
                  { value: 'none', label: 'No variants' },
                  ...variantAttributes.map((a) => ({ value: a.key, label: a.label })),
                  { value: 'custom', label: 'Other (type your own, e.g. pack size)' },
                ].map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm text-neutral-800">
                    <input type="radio" name="variantMode" checked={variationMode === o.value} onChange={() => chooseMode(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field>

            {variantAttributes.some((a) => a.key === variationMode) && (
              <Field label={`Choose the ${variantAttributes.find((a) => a.key === variationMode)?.label.toLowerCase()} options you sell`}>
                <div className="flex flex-wrap gap-2">
                  {variantAttributes
                    .find((a) => a.key === variationMode)!
                    .allowedValues.map((v) => {
                      const on = rows.some((r) => r.title === v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleValue(v)}
                          className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${on ? 'bg-teal-50 border-teal-500 text-teal-800' : 'bg-white border-neutral-300 text-neutral-600'}`}
                        >
                          {v}
                        </button>
                      );
                    })}
                </div>
              </Field>
            )}

            {variationMode === 'custom' && (
              <Field label="Add options" hint="e.g. 250 g, 500 g, 1 kg">
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                  <button type="button" onClick={addCustom} className="px-4 rounded-xl bg-teal-600 text-white text-sm font-semibold">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {rows.map((r) => (
                    <span key={r.title} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-100 text-xs font-semibold">
                      {r.title}
                      <button type="button" onClick={() => toggleValue(r.title)} className="text-neutral-500">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {step === 'price' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Price & stock</h2>
            <p className="text-xs text-neutral-500">MRP is the printed price. Add a selling price only if you sell for less. Stock 0 means unlimited.</p>
            <div className="space-y-3">
              {rows.length === 0 && <p className="text-sm text-amber-700">Go back to Variants and pick the options you sell.</p>}
              {rows.map((r, i) => (
                <div key={r.title + i} className="rounded-xl border border-neutral-200 p-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="col-span-2 sm:col-span-5 text-sm font-semibold text-neutral-800">{variationMode === 'none' ? 'Your product' : r.title}</div>
                  <Field label="MRP (₹)" required>
                    <input type="number" min="0" className={inputCls} value={r.price} onChange={(e) => updateRow(i, { price: e.target.value })} />
                  </Field>
                  <Field label="Selling price (₹)">
                    <input type="number" min="0" className={inputCls} value={r.discPrice} onChange={(e) => updateRow(i, { discPrice: e.target.value })} />
                  </Field>
                  <Field label="Stock">
                    <input type="number" min="0" className={inputCls} value={r.stock} onChange={(e) => updateRow(i, { stock: e.target.value })} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="SKU" hint="Leave blank to generate one">
                      <input className={inputCls} value={r.sku} onChange={(e) => updateRow(i, { sku: e.target.value })} />
                    </Field>
                  </div>
                  {variationMode !== 'none' && (
                    <div className="col-span-2 sm:col-span-5">
                      <Field
                        label={`Photos for ${r.title || 'this option'}`}
                        hint="Shown when a buyer selects this option. Leave empty to use the main product photos."
                      >
                        <div className="flex flex-wrap gap-2">
                          {r.images.map((src, pi) => (
                            <div key={src + pi} className="relative w-16 h-16 rounded-lg border border-neutral-200 overflow-hidden">
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => updateRow(i, { images: r.images.filter((_, x) => x !== pi) })}
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none"
                                aria-label="Remove photo"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {r.images.length < MAX_OPTION_PHOTOS && (
                            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-xl cursor-pointer hover:bg-neutral-50">
                              {uploadingRow === i ? <span className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /> : '+'}
                              <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingRow !== null} onChange={(e) => onOptionPhotos(i, e)} />
                            </label>
                          )}
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="HSN code" required={needsHsn} hint={needsHsn ? '4, 6 or 8 digits' : 'Optional — needed once you are GST registered'}>
                <input className={inputCls} inputMode="numeric" maxLength={8} value={hsnCode} onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="GST slab">
                <select className={inputCls} value={taxId} onChange={(e) => setTaxId(e.target.value)}>
                  <option value="">Not set</option>
                  {taxes.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                      {t.percentage !== undefined ? ` (${t.percentage}%)` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Handling time (days)" hint="Time to pack and hand over">
                <input type="number" min="0" max="30" className={inputCls} value={handlingTimeDays} onChange={(e) => setHandlingTimeDays(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 'shipping' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Shipping & returns</h2>
            {requiresShipping ? (
              <p className="text-xs rounded-xl border border-blue-200 bg-blue-50 text-blue-900 p-3">
                You sell through E-Commerce, so couriers need the packed weight and size to quote the right charges.
              </p>
            ) : (
              <p className="text-xs text-neutral-500">Optional for Quick delivery. Fill it in if you also ship by courier.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Package weight (g)" required={requiresShipping}>
                <input type="number" min="1" className={inputCls} value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} />
              </Field>
              <Field label="Package size (cm)" required={requiresShipping} hint="Length × width × height">
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min="0" placeholder="L" className={inputCls} value={dimL} onChange={(e) => setDimL(e.target.value)} />
                  <input type="number" min="0" placeholder="W" className={inputCls} value={dimW} onChange={(e) => setDimW(e.target.value)} />
                  <input type="number" min="0" placeholder="H" className={inputCls} value={dimH} onChange={(e) => setDimH(e.target.value)} />
                </div>
              </Field>
            </div>
            <Field label="Return eligibility">
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {[true, false].map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    onClick={() => setIsReturnable(b)}
                    className={`py-2.5 rounded-xl border text-sm font-semibold ${isReturnable === b ? 'bg-teal-50 border-teal-500 text-teal-800 ring-1 ring-teal-500' : 'bg-white border-neutral-300 text-neutral-600'}`}
                  >
                    {b ? 'Returnable' : 'Not returnable'}
                  </button>
                ))}
              </div>
            </Field>
            {isReturnable && (
              <Field label="Return window (days)">
                <input type="number" min="0" className={`${inputCls} max-w-[160px]`} value={maxReturnDays} onChange={(e) => setMaxReturnDays(e.target.value)} />
              </Field>
            )}
          </>
        )}

        {step === 'review' && (
          <>
            <h2 className="text-base font-bold text-neutral-900">Review & submit</h2>
            <div className="flex gap-4 rounded-xl border border-neutral-200 p-3">
              <div className="w-20 h-20 rounded-lg bg-neutral-50 border border-neutral-200 overflow-hidden shrink-0">
                {mainPreview && <img src={mainPreview} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-neutral-900 truncate">{productName || 'Untitled product'}</p>
                <p className="text-xs text-neutral-500">
                  {condition}
                  {modelNumber ? ` · Model ${modelNumber}` : ''}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {rows.length} variation{rows.length === 1 ? '' : 's'}
                  {rows[0]?.price ? ` · from ₹${Math.min(...rows.map((r) => Number(r.discPrice) || Number(r.price) || 0).filter((n) => n > 0))}` : ''}
                </p>
              </div>
            </div>

            {(config?.rule.requiredDocs.length || 0) > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-800">Compliance documents</p>
                {!productId && <p className="text-xs text-amber-700">Complete the earlier steps first so the product is saved.</p>}
                {config!.rule.requiredDocs.map((req) => {
                  const doc = docs.find((d) => d.docType === req.key);
                  return (
                    <div key={req.key} className="rounded-xl border border-neutral-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-800">
                          {req.label} <span className="text-red-500">*</span>
                        </p>
                        {doc ? (
                          <p className="text-[11px] text-neutral-500 truncate">
                            {doc.originalName} ·{' '}
                            <span className={doc.status === 'Approved' ? 'text-green-700 font-semibold' : doc.status === 'Rejected' ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                              {doc.status === 'Pending' ? 'Awaiting verification' : doc.status}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-neutral-400">Not uploaded</p>
                        )}
                        {doc?.status === 'Rejected' && doc.remarks && <p className="text-[11px] text-red-600">Reason: {doc.remarks}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc && (
                          <button type="button" onClick={() => onDocView(doc._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200">
                            View
                          </button>
                        )}
                        <label className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${productId ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-neutral-200 text-neutral-400 pointer-events-none'}`}>
                          {uploadingDoc === req.key ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                            disabled={!productId || Boolean(uploadingDoc)}
                            onChange={(e) => {
                              onDocUpload(req.key, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {doc && (
                          <button type="button" onClick={() => onDocDelete(doc._id)} className="px-2 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {readiness.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900 mb-1">Before you can submit</p>
                <ul className="space-y-1">
                  {readiness.map((m, i) => (
                    <li key={i} className="text-xs text-amber-900 flex items-center justify-between gap-3">
                      <span>• {m.label}</span>
                      <button type="button" onClick={() => goTo(m.step)} className="font-semibold text-teal-700 hover:underline shrink-0">
                        Fix
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs rounded-xl border border-green-200 bg-green-50 text-green-800 p-3 font-medium">Everything needed is filled in.</p>
            )}
          </>
        )}
      </section>

      <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border border-neutral-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => (stepIndex === 0 ? navigate('/seller/product/list') : back())} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200">
            {stepIndex === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex items-center gap-2">
            {productId && step !== 'review' && (
              <button type="button" onClick={() => navigate('/seller/product/list')} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100">
                Save & exit
              </button>
            )}
            {step === 'category' && (
              <button type="button" onClick={onNextCategory} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Next'}
              </button>
            )}
            {step === 'basic' && (
              <button type="button" onClick={onNextBasic} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save & next'}
              </button>
            )}
            {step === 'attributes' && (
              <button type="button" onClick={onNextAttributes} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save & next'}
              </button>
            )}
            {step === 'variants' && (
              <button type="button" onClick={onNextVariants} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                Next
              </button>
            )}
            {step === 'price' && (
              <button type="button" onClick={onNextPrice} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save & next'}
              </button>
            )}
            {step === 'shipping' && (
              <button type="button" onClick={onNextShipping} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save & next'}
              </button>
            )}
            {step === 'review' &&
              (canSubmit ? (
                <>
                  <button type="button" onClick={() => navigate('/seller/product/list')} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100">
                    Save draft
                  </button>
                  <button type="button" onClick={onSubmit} disabled={saving || readiness.length > 0} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                    {saving ? 'Submitting…' : status === 'Rejected' ? 'Resubmit for review' : 'Submit for review'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => navigate('/seller/product/list')} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">
                  Done
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
