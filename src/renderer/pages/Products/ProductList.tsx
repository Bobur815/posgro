// src/renderer/pages/Products/ProductList.tsx
import React, { useEffect, useState,  } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { ProductFilters } from "../../components/products/ProductFilters";
import { Product, ProductFilterParams } from "@shared/types";
import { ChevronDown, ChevronUp, Edit, ListIndentIncrease, Trash } from "lucide-react";
import { formatDate } from "../../utils/formatters";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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

const SearchInput = styled(Input)`
  max-width: 300px;
`;

export function ProductList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { products, categories, suppliers, loadProducts, loadCategories, loadSuppliers, isLoading } = useProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadSuppliers();
  }, [loadProducts, loadCategories, loadSuppliers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params: ProductFilterParams = { ...filters };
      if (searchQuery) {
        params.query = searchQuery;
      }
      loadProducts(params);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, filters, loadProducts]);

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ');
    return i18n.language === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
  };

  const columns = [
    {key: "index", header: "#", render: (_: Product, index: number) => index + 1},
    {key: "id", header: t("pos.id")},
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
        product.expiryDate
          ? formatDate(product.expiryDate)
          : "-",
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
          onClick={() => navigate(`/products/${product.id}/edit`)}
        >
          <Edit size={16}/>
        </Button>

        <Button
          variant="danger"
          size="small"
          tooltip={t("common.delete")}
          onClick={() => navigate(`/products/${product.id}/delete`)}
        >
          <Trash size={16}/>
        </Button>

        <Button
          variant="primary"
          size="small"
          tooltip={t("products.viewDetails")}
          onClick={() => navigate(`/products/${product.id}`)}
        >
          <ListIndentIncrease size={16} />
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
          <Button style={{fontSize: "24px"}} onClick={() => navigate("/products/new")}>
           {t("products.addProduct")}
          </Button>
        )}
      </Header>

      <Filters>
        <SearchInput
          type="text"
          placeholder={t("common.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <Button style={{ padding: "0px 12px" }} size="small" onClick={() => setIsFilterOpen(!isFilterOpen)}>
          {t("filters.filters")} {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
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
        data={products}
        loading={isLoading}
        emptyMessage={t("products.noProducts")}
      />
    </Container>
  );
}
