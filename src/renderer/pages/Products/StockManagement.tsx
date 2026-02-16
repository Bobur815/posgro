import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { ProductFilters } from "../../components/products/ProductFilters";
import { Product, ProductFilterParams } from "@shared/types";
import { useToast } from "../../context/ToastContext";
import {
  ChevronDown,
  ChevronUp,
  Keyboard,
  SendHorizontal,
  X,
} from "lucide-react";
import { SupplierManagementModal } from "../Suppliers/SupplierManagementModal";
import { NewArrivalModal } from "./NewArrivalModal";
import { VirtualKeyboard } from "../../components/common/VirtualKeyboard";
import {
  SearchInputWrapper,
  InputControls,
  ClearButton,
  KbToggle,
} from "../../components/common/SearchControls";
import { debounce } from "@renderer/utils/helpers";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { formatQuantity } from "../../utils/formatters";

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

const SearchRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-end;
`;

const SearchField = styled.div`
  flex: 1;
`;

const SearchLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  text-transform: uppercase;
  font-weight: 500;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: 18px;
  font-weight: bold;
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const SubmitButton = styled.button`
  height: 46px;
  width: 46px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: none;
  background-color: ${({ theme }) => theme.colors.success};
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const LowStockBadge = styled.span`
  background-color: ${({ theme }) => theme.colors.warning};
  color: white;
  padding: 6px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

const OutOfStockBadge = styled.span`
  background-color: ${({ theme }) => theme.colors.error};
  color: white;
  padding: 6px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

export function StockManagement() {
  const { t, i18n } = useTranslation();
  const {
    products,
    categories,
    suppliers,
    loadProducts,
    loadCategories,
    loadSuppliers,
    getLowStock,
    searchByBarcode,
    getById,
    updateProduct,
    isLoading,
  } = useProducts();
  const { user } = useAuthStore();
  const toast = useToast();

  const [showArrival, setShowArrival] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [idInput, setIdInput] = useState("");
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadSuppliers();
  }, [loadProducts, loadCategories, loadSuppliers]);

  const debouncedSearch = useMemo(
    () =>
      debounce((query: string, f: ProductFilterParams) => {
        const params: ProductFilterParams = { ...f };
        if (query.trim()) {
          params.query = query;
        }
        loadProducts(params);
      }, 300),
    [loadProducts],
  );

  useEffect(() => {
    debouncedSearch(searchQuery, filters);
  }, [filters, searchQuery, debouncedSearch]);

  const handleAddArrival = (product: Product) => {
    setSelectedProduct(product);
    setShowArrival(true);
  };

  const handleBarcodeSubmit = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    const product = (await searchByBarcode(
      barcodeInput.trim(),
    )) as Product | null;
    if (product) {
      handleAddArrival(product);
      setBarcodeInput("");
    } else {
      toast.error(t("products.noResults"));
      setBarcodeInput("");
    }
  }, [barcodeInput, searchByBarcode, t]);

  const handleIdSubmit = useCallback(async () => {
    if (!idInput.trim()) return;
    const product = (await getById(idInput.trim())) as Product | null;
    if (product) {
      handleAddArrival(product);
      setIdInput("");
    } else {
      toast.error(t("products.noResults"));
      setIdInput("");
    }
  }, [idInput, getById, t]);

  const handleVirtualKeyPress = (key: string) => {
    if (key === "BACKSPACE") {
      setSearchQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "ENTER") return;
    setSearchQuery((prev) => prev + key);
  };

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const columns = [
    { key: "#", header: "#", render: (_: Product, index: number) => index + 1 },
    { key: "id", header: t("pos.id") },
    { key: "barcode", header: t("products.barcode") },
    {
      key: "name",
      header: t("products.name"),
      render: (product: Product) =>
        i18n.language === "uz" ? product.nameUz : product.nameRu,
    },
    {
      key: "costPrice",
      header: t("products.cost"),
      render: (product: Product) =>
        product.costPrice ? formatCurrency(product.costPrice) : "—",
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
          {product.stock <= 0 ? (
            <OutOfStockBadge>{t("products.outOfStock")}</OutOfStockBadge>
          ) : product.stock <= product.minStock ? (
            <LowStockBadge>{t("products.lowStock")}</LowStockBadge>
          ) : null}
        </span>
      ),
    },
    {
      key: "minStock",
      header: t("products.minStock"),
      render: (product: Product) => `${product.minStock} ${product.unit}`,
    },
    {
      key: "actions",
      header: "",
      render: (product: Product) => (
        <Button size="medium" onClick={() => handleAddArrival(product)}>
          {t("inventory.addArrival")}
        </Button>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title>
          {t("inventory.stockManagement")}
          {products.filter((p) => p.stock <= p.minStock).length > 0 && (
            <LowStockBadge>
              {products.filter((p) => p.stock <= p.minStock).length}{" "}
              {t("inventory.lowStockItems")}
            </LowStockBadge>
          )}
        </Title>
      </Header>

      <SearchRow>
        <SearchInputWrapper>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("common.search")}
            style={{
              padding: "8px 16px",
              fontSize: "18px",
              fontWeight: "bold",
              paddingRight: "60px",
            }}
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
              {keyboardOpen ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </KbToggle>
          </InputControls>
        </SearchInputWrapper>
        <Button
          size="medium"
          style={{ padding: "10px 12px" }}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          {t("filters.filters")}{" "}
          {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
        </Button>
        <SearchField>
          <SearchLabel>{t("pos.barcode")}</SearchLabel>
          <SearchInput
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBarcodeSubmit();
              }
            }}
            placeholder={t("pos.enterBarcode")}
            autoFocus
          />
        </SearchField>

        <SearchField style={{ maxWidth: 150 }}>
          <SearchLabel>{t("pos.id")}</SearchLabel>
          <SearchInput
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleIdSubmit();
              }
            }}
            placeholder={t("pos.id")}
          />
        </SearchField>
        <SubmitButton
          onClick={() => {
            if (barcodeInput.trim()) handleBarcodeSubmit();
            else if (idInput.trim()) handleIdSubmit();
          }}
        >
          <SendHorizontal size={22} />
        </SubmitButton>
      </SearchRow>

      <ProductFilters
        filters={filters}
        onChange={setFilters}
        categories={categories as any}
        suppliers={suppliers}
        isOpen={isFilterOpen}
      />

      <Table
        columns={columns}
        data={products}
        loading={isLoading}
        emptyMessage={t("products.noProducts")}
      />

      {showArrival && selectedProduct && (
        <NewArrivalModal
          product={selectedProduct}
          suppliers={suppliers}
          userId={user?.id}
          onClose={() => setShowArrival(false)}
          onSuccess={() => {
            setShowArrival(false);
            loadProducts();
            toast.success(t("inventory.arrivalCreated"));
          }}
          onOpenSupplierModal={() => setShowSupplierModal(true)}
        />
      )}
      {showSupplierModal && (
        <SupplierManagementModal
          onClose={() => setShowSupplierModal(false)}
          onSupplierChanged={loadSuppliers}
        />
      )}

      {keyboardOpen && (
        <VirtualKeyboard
          fixed
          onKeyPress={handleVirtualKeyPress}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </Container>
  );
}
