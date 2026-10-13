import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProducts,
  deleteProduct,
  Product,
  ProductVariation,
} from "../../../services/api/productService";
import {
  getCategories,
  Category as apiCategory,
} from "../../../services/api/categoryService";
import { duplicateProduct } from "../../../services/api/sellerListingService";
import { useAuth } from "../../../context/AuthContext";
import StarRating from "../../../components/ui/StarRating";

const REVIEW_BADGE: Record<string, { label: string; tone: string }> = {
  Draft: { label: "Draft", tone: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  Incomplete: { label: "Incomplete", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  Pending: { label: "Submitted", tone: "bg-blue-50 text-blue-800 border-blue-200" },
  UnderReview: { label: "Under review", tone: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  Active: { label: "Published", tone: "bg-green-50 text-green-800 border-green-200" },
  Rejected: { label: "Changes needed", tone: "bg-orange-50 text-orange-800 border-orange-200" },
  Inactive: { label: "Hidden", tone: "bg-neutral-100 text-neutral-600 border-neutral-300" },
};

/** Draft → Incomplete (what's missing) → Submitted → Under review → Changes needed / Published. */
const reviewStage = (product: any): string => {
  if (product.status === "Draft" && Array.isArray(product.missingFields) && product.missingFields.length > 0) return "Incomplete";
  if (product.status === "Pending" && product.reviewStartedAt) return "UnderReview";
  return product.status;
};

const REVIEW_FILTERS = [
  { value: "All", label: "All Products" },
  { value: "Draft", label: "Drafts" },
  { value: "Pending", label: "Awaiting review" },
  { value: "Active", label: "Live" },
  { value: "Rejected", label: "Changes needed" },
  { value: "Inactive", label: "Hidden" },
  { value: "RevisionPending", label: "Edits awaiting review" },
];

export default function SellerProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Products");
  const [stockFilter, setStockFilter] = useState("All Products");
  const [reviewFilter, setReviewFilter] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set()
  );
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalPages, setTotalPages] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<{
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null>(null);
  const [allCategories, setAllCategories] = useState<apiCategory[]>([]);
  const { user } = useAuth();

  // Fetch categories
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const response = await getCategories();
        if (response.success && response.data) {
          setAllCategories(response.data);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    };
    fetchCats();
  }, []);

  // Fetch products
  const fetchProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn || "createdAt",
        sortOrder: sortDirection,
      };

      if (searchTerm) {
        params.search = searchTerm;
      }
      if (categoryFilter) {
        params.category = categoryFilter;
      }
      if (statusFilter === "Published") {
        params.status = "published";
      } else if (statusFilter === "Unpublished") {
        params.status = "unpublished";
      }
      if (stockFilter === "In Stock") {
        params.stock = "inStock";
      } else if (stockFilter === "Out of Stock") {
        params.stock = "outOfStock";
      }
      if (reviewFilter !== "All") {
        params.reviewStatus = reviewFilter;
      }

      const response = await getProducts(params);
      if (response.success && response.data) {
        setProducts(response.data);
        // Extract pagination info if available
        if (response.pagination) {
          setTotalPages(response.pagination.pages);
          setPaginationInfo(response.pagination);
        } else {
          // Fallback: calculate pages from data length if pagination not available
          setTotalPages(Math.ceil(response.data.length / rowsPerPage));
          setPaginationInfo(null);
        }
      } else {
        setError(response.message || "Failed to fetch products");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to fetch products"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [
    currentPage,
    rowsPerPage,
    searchTerm,
    categoryFilter,
    statusFilter,
    stockFilter,
    reviewFilter,
    sortColumn,
    sortDirection,
  ]);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      const response = await deleteProduct(productToDelete);
      if (
        response.success ||
        response.message === "Product deleted successfully"
      ) {
        fetchProducts();
        setDeleteModalOpen(false);
        setProductToDelete(null);
      } else {
        console.error("Failed to delete product");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const handleEdit = (productId: string) => {
    navigate(`/seller/product/edit/${productId}`);
  };

  const handleCopy = async (productId: string) => {
    try {
      const res = await duplicateProduct(productId);
      if (res.success && res.data?._id) navigate(`/seller/product/edit/${res.data._id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not copy this product");
    }
  };

  // ... (rest of logic: flatten, filter, sort)

  // Flatten products with variations for display
  // Handle products with no variations by creating a default variation entry
  const allVariations = products.flatMap((product) => {
    // If product has no variations, create a default one
    if (!product.variations || product.variations.length === 0) {
      return [{
        variationId: `${product._id}-default`,
        productName: product.productName,
        sellerName: user?.storeName || "",
        productImage:
          product.mainImage ||
          product.mainImageUrl ||
          "/assets/product-placeholder.jpg",
        brandName: (product.brand as any)?.name || "-",
        category: (product.category as any)?.name || "-",
        subCategory: (product.subcategory as any)?.name || "-",
        price: (product as any).price || 0,
        discPrice: (product as any).discPrice || 0,
        variation: "Default",
        isPopular: product.popular,
        productId: product._id,
        rating: product.rating || 0,
        reviewsCount: product.reviewsCount || 0,
      }];
    }
    // If product has variations, map them
    return product.variations.map((variation, index) => ({
      variationId: variation._id || `${product._id}-${index}`,
      productName: product.productName,
      sellerName: user?.storeName || "",
      productImage:
        product.mainImage ||
        product.mainImageUrl ||
        "/assets/product-placeholder.jpg",
      brandName: (product.brand as any)?.name || "-",
      category: (product.category as any)?.name || "-",
      subCategory: (product.subcategory as any)?.name || "-",
      price: variation.price,
      discPrice: variation.discPrice,
      variation:
        variation.title || variation.value || variation.name || "Default",
      isPopular: product.popular,
      productId: product._id,
      rating: product.rating || 0,
      reviewsCount: product.reviewsCount || 0,
    }));
  });

  // Filter variations
  // Since we are using server-side filtering (triggered by useEffect dependencies), 
  // the 'products' array is already filtered by the backend.
  // We should not filter again on the client side as it may hide valid results 
  // (e.g., if backend search matches fields not available in the frontend model).
  let filteredVariations = allVariations;

  // Sort variations
  if (sortColumn) {
    filteredVariations.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof typeof a];
      let bVal: any = b[sortColumn as keyof typeof b];
      if (typeof aVal === "string" || typeof bVal === "string") {
        aVal = String(aVal ?? "").toLowerCase();
        bVal = String(bVal ?? "").toLowerCase();
      }
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  // When using API pagination, don't do client-side pagination on already-paginated results
  // The API already returns the correct page of products, so we use all filtered variations
  // Only do client-side pagination if we don't have server-side pagination info
  const useServerPagination = totalPages > 1 && paginationInfo !== null;
  const displayTotalPages = useServerPagination
    ? totalPages
    : Math.ceil(filteredVariations.length / rowsPerPage);

  // Calculate start and end indices for display
  const startIndex = useServerPagination
    ? (paginationInfo!.page - 1) * paginationInfo!.limit
    : (currentPage - 1) * rowsPerPage;
  const endIndex = useServerPagination
    ? Math.min(startIndex + paginationInfo!.limit, paginationInfo!.total)
    : Math.min(currentPage * rowsPerPage, filteredVariations.length);

  // Only slice if NOT using server pagination (i.e., all data is loaded)
  const displayedVariations = useServerPagination
    ? filteredVariations
    : filteredVariations.slice(startIndex, endIndex);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const SortIcon = ({ column }: { column: string }) => (
    <span className="text-neutral-300 text-[10px]">
      {sortColumn === column ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
    </span>
  );

  // Get unique categories for filter
  const categories = allCategories.map((cat) => cat.name);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-neutral-800">
          Product List
        </h1>
        <div className="text-sm text-blue-500">
          <span className="cursor-pointer hover:underline">Home</span>{" "}
          <span className="text-neutral-400">/</span>{" "}
          <span className="text-neutral-600">Dashboard</span>
        </div>
      </div>

      {/* Content Card */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex-1 flex flex-col">
        <div className="p-4 border-b border-neutral-100 font-medium text-neutral-700">
          View Product List
        </div>

        {/* Filters and Controls */}
        <div className="p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center justify-between border-b border-neutral-100">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                Filter By Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer">
                <option value="">All Category</option>
                {allCategories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer">
                <option value="All Products">All Products</option>
                <option value="Published">Published</option>
                <option value="Unpublished">Unpublished</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                Review Status
              </label>
              <select
                value={reviewFilter}
                onChange={(e) => {
                  setReviewFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer">
                {REVIEW_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                Filter by Stock
              </label>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer">
                <option value="All Products">All Products</option>
                <option value="In Stock">In Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Show</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none cursor-pointer">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <button
              onClick={() => {
                const headers = [
                  "Product Id",
                  "Variation Id",
                  "Product Name",
                  "Seller Name",
                  "Brand Name",
                  "Category",
                  "Price",
                  "Disc Price",
                  "Variation",
                ];
                const csvContent = [
                  headers.join(","),
                  ...filteredVariations.map((v) =>
                    [
                      v.productId,
                      v.variationId,
                      `"${v.productName}"`,
                      `"${v.sellerName}"`,
                      `"${v.brandName}"`,
                      `"${v.category}"`,
                      v.price,
                      v.discPrice,
                      `"${v.variation}"`,
                    ].join(",")
                  ),
                ].join("\n");
                const blob = new Blob([csvContent], {
                  type: "text/csv;charset=utf-8;",
                });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute(
                  "download",
                  `products_${new Date().toISOString().split("T")[0]}.csv`
                );
                link.style.visibility = "hidden";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 transition-colors">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-1">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
                Search:
              </span>
              <input
                type="text"
                className="pl-14 pr-3 py-1.5 bg-neutral-100 border-none rounded text-sm focus:ring-1 focus:ring-teal-500 w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder=""
              />
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-8 text-center text-neutral-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-2"></div>
            Loading products...
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-8 text-center text-red-600">
            <p>{error}</p>
            <button
              onClick={fetchProducts}
              className="mt-4 px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse border border-neutral-200">
              <thead>
                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800">
                  <th className="p-4 w-16 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      Product Id
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("variationId")}>
                    <div className="flex items-center justify-between">
                      Variation Id <SortIcon column="variationId" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("productName")}>
                    <div className="flex items-center justify-between">
                      Product Name <SortIcon column="productName" />
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      Review
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      Rating
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("sellerName")}>
                    <div className="flex items-center justify-between">
                      Seller Name <SortIcon column="sellerName" />
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      product Image
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("brandName")}>
                    <div className="flex items-center justify-between">
                      Brand Name <SortIcon column="brandName" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("category")}>
                    <div className="flex items-center justify-between">
                      Category <SortIcon column="category" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("subCategory")}>
                    <div className="flex items-center justify-between">
                      SubCategory <SortIcon column="subCategory" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("price")}>
                    <div className="flex items-center justify-between">
                      Price <SortIcon column="price" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("discPrice")}>
                    <div className="flex items-center justify-between">
                      Disc Price <SortIcon column="discPrice" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("variation")}>
                    <div className="flex items-center justify-between">
                      Variation <SortIcon column="variation" />
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">
                    <div className="flex items-center justify-center">Action</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedVariations.map((variation, index) => {
                  const isFirstVariation =
                    index === 0 ||
                    displayedVariations[index - 1].productId !==
                    variation.productId;
                  const product = products.find(
                    (p) => p._id === variation.productId
                  );
                  const hasMultipleVariations =
                    product && product.variations.length > 1;
                  const isExpanded = expandedProducts.has(variation.productId);

                  return (
                    <tr
                      key={`${variation.productId}-${variation.variationId}`}
                      className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700">
                      <td className="p-4 align-middle border border-neutral-200">
                        <div className="flex items-center gap-2">
                          {isFirstVariation && hasMultipleVariations && (
                            <button
                              onClick={() => toggleProduct(variation.productId)}
                              className="text-blue-600 hover:text-blue-700">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round">
                                {isExpanded ? (
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                ) : (
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                )}
                              </svg>
                            </button>
                          )}
                          <span>{variation.productId}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.variationId}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        <div className="flex flex-col gap-1">
                          <span>{variation.productName}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {isFirstVariation && product && (() => {
                          const badge = REVIEW_BADGE[reviewStage(product)] || REVIEW_BADGE.Active;
                          const missing: string[] = (product as any).missingFields || [];
                          const revisionPending = Boolean((product as any).pendingRevision?.submittedAt);
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.tone}`}>
                                {badge.label}
                              </span>
                              {revisionPending && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-purple-50 text-purple-800 border-purple-200">
                                  Edits under review
                                </span>
                              )}
                              {(product as any).status === "Rejected" && (
                                <>
                                  <span className="text-[11px] text-orange-800 max-w-[180px]">
                                    {(product as any).rejectionReason || "No reason was given."}
                                  </span>
                                  <button
                                    onClick={() => handleEdit(variation.productId)}
                                    className="text-[11px] font-semibold text-teal-700 hover:underline">
                                    Fix &amp; resubmit
                                  </button>
                                </>
                              )}
                              {(product as any).status === "Draft" && (
                                <>
                                  {missing.length > 0 && (
                                    <span className="text-[11px] text-amber-800 max-w-[180px]">
                                      Missing: {missing.slice(0, 3).join(", ")}
                                      {missing.length > 3 ? ` +${missing.length - 3} more` : ""}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleEdit(variation.productId)}
                                    className="text-[11px] font-semibold text-teal-700 hover:underline">
                                    Finish &amp; submit
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {(variation.rating > 0 || variation.reviewsCount > 0) ? (
                          <StarRating
                            rating={variation.rating}
                            reviewCount={variation.reviewsCount}
                            size="sm"
                          />
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.sellerName}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        <div className="w-16 h-12 bg-white border border-neutral-200 rounded p-1 flex items-center justify-center mx-auto">
                          <img
                            src={variation.productImage}
                            alt={variation.productName}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "https://placehold.co/60x40?text=Img";
                            }}
                          />
                        </div>
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.brandName || "-"}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.category}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.subCategory}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        ₹{variation.price.toFixed(2)}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.discPrice > 0
                          ? `₹${variation.discPrice.toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        {variation.variation}
                      </td>
                      <td className="p-4 align-middle border border-neutral-200">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(variation.productId)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit Product">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleCopy(variation.productId)}
                            className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                            title="Copy into a new draft">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(variation.productId)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Product">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayedVariations.length === 0 && (
                  <tr>
                    <td
                      colSpan={13}
                      className="p-8 text-center text-neutral-400 border border-neutral-200">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && !error && (
          <div className="px-4 sm:px-6 py-3 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
            <div className="text-xs sm:text-sm text-neutral-700">
              Showing {startIndex + 1} to {endIndex} of{" "}
              {useServerPagination && paginationInfo
                ? paginationInfo.total
                : filteredVariations.length}{" "}
              entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`min-w-[36px] h-[36px] flex items-center justify-center border border-teal-600 rounded transition-colors ${currentPage === 1
                  ? "text-neutral-300 border-neutral-200 cursor-not-allowed"
                  : "text-teal-600 hover:bg-teal-50"
                  }`}
                aria-label="Previous page">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M15 18L9 12L15 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="flex gap-2">
                {(() => {
                  const pages = [];
                  const maxVisiblePages = 5;

                  if (displayTotalPages <= maxVisiblePages) {
                    for (let i = 1; i <= displayTotalPages; i++) {
                      pages.push(i);
                    }
                  } else {
                    if (currentPage <= 3) {
                      for (let i = 1; i <= 4; i++) pages.push(i);
                      pages.push("...");
                      pages.push(displayTotalPages);
                    } else if (currentPage >= displayTotalPages - 2) {
                      pages.push(1);
                      pages.push("...");
                      for (let i = displayTotalPages - 3; i <= displayTotalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      pages.push("...");
                      pages.push(currentPage - 1);
                      pages.push(currentPage);
                      pages.push(currentPage + 1);
                      pages.push("...");
                      pages.push(displayTotalPages);
                    }
                  }

                  return pages.map((page, idx) => {
                    if (page === "...") {
                      return (
                        <span key={`ellipsis-${idx}`} className="flex items-end justify-center px-1 text-neutral-400">
                          ...
                        </span>
                      );
                    }

                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(Number(page))}
                        className={`min-w-[36px] h-[36px] flex items-center justify-center border rounded text-sm font-medium transition-colors ${currentPage === page
                          ? "bg-teal-600 border-teal-600 text-white"
                          : "border-teal-600 text-teal-600 hover:bg-teal-50"
                          }`}>
                        {page}
                      </button>
                    );
                  });
                })()}
              </div>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(displayTotalPages, prev + 1))
                }
                disabled={currentPage === displayTotalPages}
                className={`min-w-[36px] h-[36px] flex items-center justify-center border border-teal-600 rounded transition-colors ${currentPage === displayTotalPages
                  ? "text-neutral-300 border-neutral-200 cursor-not-allowed"
                  : "text-teal-600 hover:bg-teal-50"
                  }`}
                aria-label="Next page">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M9 18L15 12L9 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden transform transition-all scale-100 opacity-100">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-red-600">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-2">
                Delete Product?
              </h3>
              <p className="text-neutral-600 mb-6">
                Are you sure you want to delete this product? This action cannot be
                undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-sm">
                  Delete Product
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
