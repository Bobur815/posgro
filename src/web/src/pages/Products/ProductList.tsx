// src/web/src/pages/Products/ProductList.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProductForm } from "./ProductForm";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { Table } from "@components/common/Table";
import { Pagination } from "@components/common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { ProductFilters } from "@components/products/ProductFilters";
import { Product, ProductFilterParams } from "@shared/types";
import {
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Edit,
  Trash,
  X,
  Eye,
  Plus,
} from "lucide-react";
import { keyframes } from "styled-components";
import { formatDate } from "../../utils/formatters";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { debounce } from "../../utils/helpers";
import {
  MobileCard,
  MobileCardList,
  DesktopOnly,
} from "../../components/common/MobileCard";

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 59, 130, 246), 0.5); }
  70% { box-shadow: 0 0 0 12px rgba(var(--primary-rgb, 59, 130, 246), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 59, 130, 246), 0); }
`;

const FAB = styled.button`
  position: fixed;
  bottom: 50px;
  right: 16px;
  z-index: 100;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background-color: ${({ theme }) => theme.colors.primary};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: ${pulse} 2s ease-out infinite;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const MobileSentinel = styled.div`
  height: 1px;
  @media (min-width: 769px) {
    display: none;
  }
`;

const MOBILE_PAGE_SIZE = 20;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  position: relative;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.75rem;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const Filters = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

export function ProductList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    products,
    categories,
    suppliers,
    loadProducts,
    loadCategories,
    loadSuppliers,
    deleteProduct,
    isLoading,
  } = useProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const isAdmin = user?.role === "ADMIN";

  const [mobileCount, setMobileCount] = useState(MOBILE_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset mobile count when the product list changes (new search/filter result)
  useEffect(() => {
    setMobileCount(MOBILE_PAGE_SIZE);
  }, [products]);

  // Infinite scroll: load next batch when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && mobileCount < products.length) {
          setMobileCount((c) =>
            Math.min(c + MOBILE_PAGE_SIZE, products.length),
          );
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobileCount, products.length]);

  useEffect(() => {
    loadProducts(filters);
    loadCategories();
    loadSuppliers();
  }, [loadProducts, loadCategories, loadSuppliers]);

  const debouncedSearch = useMemo(
    () =>
      debounce((query: string, f: ProductFilterParams) => {
        const params: ProductFilterParams = { ...f };
        if (query) {
          params.query = query;
        }
        loadProducts(params);
      }, 300),
    [loadProducts],
  );

  useEffect(() => {
    debouncedSearch(searchQuery, filters);
  }, [searchQuery, filters, debouncedSearch]);

  const {
    pageData,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    pageSizeOptions,
    pageOffset,
    goToPage,
    setPageSize,
  } = usePagination(products);

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const handleDelete = async (product: Product) => {
    if (!window.confirm(t("common.confirmDelete"))) return;
    const success = await deleteProduct(String(product.id));
    if (success) loadProducts();
  };

  const columns = [
    {
      key: "index",
      header: "#",
      render: (_: Product, index: number) => pageOffset + index + 1,
    },
    { key: "id", header: t("pos.id") },
    { key: "barcode", header: t("products.barcode") },
    {
      key: "internalCode",
      header: t("products.internalCode"),
      render: (product: Product) => product.internalCode || "-",
    },
    {
      key: "name",
      header: t("products.name"),
      render: (product: Product) =>
        i18n.language === "uz" ? product.nameUz : product.nameRu,
    },
    {
      key: "price",
      header: t("products.price"),
      render: (product: Product) => formatCurrency(product.price),
    },
    {
      key: "stock",
      header: t("products.stock"),
      render: (product: Product) => (
        <span
          style={{
            color: product.stock <= product.minStock ? "#f44336" : "inherit",
          }}
        >
          {product.stock} {product.unit}
        </span>
      ),
    },
    {
      key: "expiryDate",
      header: t("products.expiryDate"),
      render: (product: Product) =>
        product.expiryDate ? formatDate(product.expiryDate) : "-",
    },
    {
      key: "supplier",
      header: t("products.supplier"),
      render: (product: Product) =>
        product.supplier
          ? i18n.language === "uz"
            ? product.supplier.nameUz
            : product.supplier.nameRu
          : "-",
    },
    {
      key: "category",
      header: t("products.category"),
      render: (product: Product) =>
        product.category
          ? i18n.language === "uz"
            ? product.category.nameUz
            : product.category.nameRu
          : "-",
    },
  ];

  if (isAdmin) {
    columns.push({
      key: "actions",
      header: t("common.actions"),
      render: (product: Product) => (
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant="secondary"
            size="small"
            tooltip={t("common.edit")}
            onClick={() => setEditProductId(String(product.id))}
          >
            <Edit size={18} />
          </Button>
          <Button
            variant="danger"
            size="small"
            tooltip={t("common.delete")}
            onClick={() => handleDelete(product)}
          >
            <Trash size={18} />
          </Button>
          <Button
            variant="primary"
            size="small"
            tooltip={t("products.viewDetails")}
            onClick={() => navigate(`/products/${product.id}`)}
          >
            <Eye size={18} />
          </Button>
        </div>
      ),
    });
  }

  return (
    <Container>
      <Header>
        <Title>{t("products.title")}</Title>
      </Header>
      {isAdmin && (
        <FAB onClick={() => setShowProductForm(true)}>
          <Plus size={38} />
        </FAB>
      )}

      <Filters>
        <div style={{ position: "relative", flex: 1 }}>
          <Input
            type="text"
            placeholder={t("common.search")}
            style={{
              padding: "8px 40px 8px 16px",
              fontSize: "16px",
              width: "100%",
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.length > 0 && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <Button
          style={{ padding: "0px 12px", flexShrink: 0 }}
          size="small"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          {t("filters.filters")}{" "}
          {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </Filters>

      <ProductFilters
        filters={filters}
        onChange={setFilters}
        categories={categories as any}
        suppliers={suppliers as any}
        isOpen={isFilterOpen}
      />

      <MobileCardList>
        {products.slice(0, mobileCount).map((product) => (
          <MobileCard
            key={product.id}
            title={i18n.language === "uz" ? product.nameUz : product.nameRu}
            subtitle={product.barcode}
            fields={[
              {
                label: t("pos.id") + " (kod)",
                value: product.id,
              },
              ...(product.internalCode
                ? [
                    {
                      label: t("products.internalCode") + " (PLU)",
                      value: product.internalCode,
                    },
                  ]
                : []),
              {
                label: t("products.price"),
                value: formatCurrency(product.price),
              },
              {
                label: t("products.stock"),
                value: (
                  <span
                    style={{
                      color:
                        product.stock <= product.minStock
                          ? "#f44336"
                          : "inherit",
                    }}
                  >
                    {product.stock} {product.unit}
                  </span>
                ),
              },
              {
                label: t("products.supplier"),
                value: product.supplier
                  ? i18n.language === "uz"
                    ? product.supplier.nameUz
                    : product.supplier.nameRu
                  : "-",
              },
              {
                label: t("products.category"),
                value: product.category
                  ? i18n.language === "uz"
                    ? product.category.nameUz
                    : product.category.nameRu
                  : "-",
              },
              {
                label: t("products.expiryDate"),
                value: product.expiryDate
                  ? formatDate(product.expiryDate)
                  : "-",
              },
            ]}
            actions={
              isAdmin ? (
                <>
                  <Button
                    variant="secondary"
                    size="small"
                    tooltip={t("common.edit")}
                    onClick={() => setEditProductId(String(product.id))}
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    tooltip={t("common.delete")}
                    onClick={() => handleDelete(product)}
                  >
                    <Trash size={16} />
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    tooltip={t("products.viewDetails")}
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <Eye size={16} />
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
      </MobileCardList>
      <MobileSentinel ref={sentinelRef} />

      <DesktopOnly>
        <Table<Product>
          columns={columns}
          data={pageData}
          loading={isLoading}
          emptyMessage={t("products.noProducts")}
          footer={
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              pageSizeOptions={pageSizeOptions}
              onPageChange={goToPage}
              onPageSizeChange={setPageSize}
            />
          }
        />
      </DesktopOnly>

      {showProductForm && (
        <ProductForm
          onClose={() => setShowProductForm(false)}
          onSuccess={() => {
            setShowProductForm(false);
            loadProducts();
          }}
        />
      )}

      {editProductId && (
        <ProductForm
          productId={editProductId}
          onClose={() => setEditProductId(null)}
          onSuccess={() => {
            setEditProductId(null);
            loadProducts();
          }}
        />
      )}
    </Container>
  );
}
