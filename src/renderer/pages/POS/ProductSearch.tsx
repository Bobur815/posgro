import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { ProductFilters } from "../../components/products/ProductFilters";
import { Product, ProductFilterParams } from "@shared/types";
import { formatQuantity } from "../../utils/formatters";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { ChevronDown, ChevronUp, Keyboard, X } from "lucide-react";
import { VirtualKeyboard } from "../../components/common/VirtualKeyboard";
import { SearchInputWrapper, InputControls, ClearButton, KbToggle } from "../../components/common/SearchControls";
import { Pagination } from "../../components/common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { debounce } from "../../utils/helpers";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const SearchHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SearchRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const ProductsGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  align-content: start;
  gap: ${({ theme }) => theme.spacing.sm};
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const ProductCard = styled.button<{ $lowStock?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: ${({ theme }) => theme.shadows.sm};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  ${({ $lowStock, theme }) =>
    $lowStock &&
    `
    border-color: ${theme.colors.warning};
  `}
`;

const ProductName = styled.span`
  font-weight: 500;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
  min-height: 34px;
`;

const ProductPrice = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: bold;
  font-size: 15px;
`;

const ProductStock = styled.span<{ $low?: boolean }>`
  font-size: 11px;
  color: ${({ theme, $low }) =>
    $low ? theme.colors.warning : theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const NoResults = styled.div`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};
  grid-column: 1 / -1;
`;

interface ProductSearchProps {
  onSelect: (product: Product) => void;
}

export function ProductSearch({ onSelect }: ProductSearchProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [topSelling, setTopSelling] = useState<Product[]>([]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const {
    products,
    categories,
    suppliers,
    search,
    loadProducts,
    loadCategories,
    loadSuppliers,
    getTopSelling,
    isLoading,
  } = useProducts();

  useEffect(() => {
    loadCategories();
    loadSuppliers();
  }, [loadCategories, loadSuppliers]);

  // Load top-selling products on mount
  useEffect(() => {
    getTopSelling().then((data) => setTopSelling(data as unknown as Product[]));
  }, [getTopSelling]);

  const hasActiveFilters =
    filters.categoryId ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    (filters.availability && filters.availability !== "all") ||
    (filters.unit && filters.unit !== "all") ||
    (filters.promotionStatus && filters.promotionStatus !== "all");

  const debouncedSearch = useMemo(
    () => debounce((query: string, f: ProductFilterParams, active: boolean) => {
      if (query.trim() || active) {
        const params: ProductFilterParams = { ...f };
        if (query.trim()) {
          params.query = query;
        }
        loadProducts(params);
      }
    }, 300),
    [loadProducts],
  );

  useEffect(() => {
    debouncedSearch(searchQuery, filters, !!hasActiveFilters);
  }, [searchQuery, filters, hasActiveFilters, debouncedSearch]);

  // Refresh products when stock changes (after sale/edit/delete)
  useEffect(() => {
    const refresh = () => {
      getTopSelling().then((data) =>
        setTopSelling(data as unknown as Product[]),
      );
      if (searchQuery.trim() || hasActiveFilters) {
        const params: ProductFilterParams = { ...filters };
        if (searchQuery.trim()) params.query = searchQuery;
        loadProducts(params);
      }
    };
    window.addEventListener("stock-updated", refresh);
    return () => window.removeEventListener("stock-updated", refresh);
  }, [getTopSelling, searchQuery, hasActiveFilters, filters, loadProducts]);

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const getProductName = (product: Product) => {
    return i18n.language === "uz" ? product.nameUz : product.nameRu;
  };

  const handleVirtualKeyPress = (key: string) => {
    if (key === "BACKSPACE") {
      setSearchQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "ENTER") {
      return;
    }
    setSearchQuery((prev) => prev + key);
  };

  const displayProducts: Product[] =
    searchQuery.trim() || hasActiveFilters
      ? (products as unknown as Product[])
      : topSelling;

  const {
    pageData,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    pageSizeOptions,
    goToPage,
    setPageSize,
  } = usePagination(displayProducts, { defaultPageSize: 24, pageSizeOptions: [12, 24, 48, 96] });

  return (
    <Container>
      <SearchHeader>
        <SearchRow>
          <SearchInputWrapper>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("common.search")}
              style={{ padding: "10px 16px", paddingRight: "60px" }}
            />
            <InputControls>
              {searchQuery.length > 0 && (
                <ClearButton onClick={() => setSearchQuery("")} tabIndex={-1}>
                  <X size={16} />
                </ClearButton>
              )}
              <KbToggle
                type="button"
                tabIndex={-1}
                $active={keyboardOpen}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setKeyboardOpen((prev) => !prev)}
              >
                <Keyboard size={18} />
                {keyboardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </KbToggle>
            </InputControls>
          </SearchInputWrapper>
          <Button size="medium" onClick={() => setIsFilterOpen(!isFilterOpen)}>
            {t("filters.filters")}{" "}
            {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </SearchRow>
        <ProductFilters
          filters={filters}
          onChange={setFilters}
          categories={categories as any}
          suppliers={suppliers}
          compact
          isOpen={isFilterOpen}
        />
      </SearchHeader>

      <ProductsGrid>
        {isLoading ? (
          <NoResults>{t("common.loading")}</NoResults>
        ) : displayProducts.length === 0 ? (
          <NoResults>{t("products.noResults")}</NoResults>
        ) : (
          pageData.map((product) => (
            <ProductCard
              key={product.id}
              onClick={() => onSelect(product)}
              disabled={product.stock <= 0}
              $lowStock={product.stock <= product.minStock && product.stock > 0}
            >
              <ProductName>{getProductName(product)}</ProductName>
              <ProductPrice>{formatCurrency(product.price)}</ProductPrice>
              <ProductStock $low={product.stock <= product.minStock}>
                {product.stock <= 0
                  ? t("products.outOfStock")
                  : `${t("products.stock")}: ${formatQuantity(product.stock, product.unit || "шт", i18n.language as "ru" | "uz")}`}
              </ProductStock>
            </ProductCard>
          ))
        )}
      </ProductsGrid>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageChange={goToPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {keyboardOpen && (
        <VirtualKeyboard
          onKeyPress={handleVirtualKeyPress}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </Container>
  );
}
