// src/web/src/pages/Products/ProductList.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  List,
  Trash,
  X,
} from "lucide-react";
import { formatDate } from "../../utils/formatters";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { debounce } from "../../utils/helpers";

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
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
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
    isLoading,
  } = useProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    loadProducts();
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

  const columns = [
    {
      key: "index",
      header: "#",
      render: (_: Product, index: number) => pageOffset + index + 1,
    },
    { key: "id", header: t("pos.id") },
    { key: "barcode", header: t("products.barcode") },
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
            <Edit size={16} />
          </Button>
          <Button
            variant="danger"
            size="small"
            tooltip={t("common.delete")}
            onClick={() => navigate(`/products/${product.id}/delete`)}
          >
            <Trash size={16} />
          </Button>
          <Button
            variant="primary"
            size="small"
            tooltip={t("products.viewDetails")}
            onClick={() => navigate(`/products/${product.id}`)}
          >
            <List size={16} />
          </Button>
        </div>
      ),
    });
  }

  return (
    <Container>
      <Header>
        <Title>{t("products.title")}</Title>
        {isAdmin && (
          <Button
            style={{ fontSize: "26px" }}
            onClick={() => setShowProductForm(true)}
          >
            <PlusCircle size={24} /> {t("products.addProduct")}
          </Button>
        )}
      </Header>

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
