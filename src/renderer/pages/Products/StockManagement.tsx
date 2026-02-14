import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Modal } from "../../components/common/Modal";
import { ProductFilters } from "../../components/products/ProductFilters";
import {
  Product,
  ProductFilterParams,
  Supplier,
  SupplierPaymentMethod,
} from "@shared/types";
import { useToast } from "../../context/ToastContext";
import { ChevronDown, ChevronUp, SendHorizontal, Settings } from "lucide-react";
import { SupplierManagementModal } from "./SupplierManagementModal";
import { getExpireInDays } from "@renderer/utils/helpers";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { formatQuantity } from "../../utils/formatters";
import { DateInput } from "../../components/common/DateInput";

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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const InfoRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InfoItem = styled.div`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const InfoLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  margin-bottom: 2px;
`;

const InfoValue = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const PriceChangeSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.warning}10;
  border: 1px solid ${({ theme }) => theme.colors.warning}40;
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const PriceChangeTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const RadioOption = styled.label<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary + "10" : "transparent"};
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const RadioText = styled.div`
  flex: 1;
`;

const RadioLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const RadioDescription = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProfitBadge = styled.span<{ $negative?: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme, $negative }) =>
    $negative ? theme.colors.error : theme.colors.success};
`;

const PAYMENT_METHODS: SupplierPaymentMethod[] = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "INSTALLMENT",
  "ONE_TO_ONE",
];

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
  const [barcodeInput, setBarcodeInput] = useState("");
  const [idInput, setIdInput] = useState("");
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [arrivalData, setArrivalData] = useState({
    quantity: "",
    cost: "",
    newPrice: "",
    priceMode: "none" as "none" | "immediate" | "deferred",
    notes: "",
    supplierId: "",
    productionDate: "",
    expirationDate: "",
    paymentMethod: "CASH" as SupplierPaymentMethod,
  });
  console.log("Products:");

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadSuppliers();
  }, [loadProducts, loadCategories, loadSuppliers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params: ProductFilterParams = { ...filters };
      if (searchQuery.trim()) {
        params.query = searchQuery;
      }
      loadProducts(params);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, searchQuery, loadProducts]);

  const handleAddArrival = (product: Product) => {
    setSelectedProduct(product);
    setArrivalData({
      quantity: "",
      cost: product.costPrice ? String(product.costPrice) : "",
      newPrice: String(product.price),
      priceMode: "none",
      notes: "",
      supplierId: product.supplierId || "",
      productionDate: product.productionDate
        ? product.productionDate.slice(0, 10)
        : "",
      expirationDate: product.expiryDate ? product.expiryDate.slice(0, 10) : "",
      paymentMethod: "CASH",
    });
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

  const costChanged =
    selectedProduct &&
    arrivalData.cost !== "" &&
    Number(arrivalData.cost) !== (selectedProduct.costPrice ?? 0);

  const profitMargin =
    arrivalData.cost && arrivalData.newPrice
      ? (
          ((Number(arrivalData.newPrice) - Number(arrivalData.cost)) /
            Number(arrivalData.cost)) *
          100
        ).toFixed(1)
      : null;

  const handleSubmitArrival = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct) return;

    try {
      await window.electronAPI.inventory.createArrival({
        productId: selectedProduct.id,
        quantity: parseFloat(arrivalData.quantity),
        cost: parseFloat(arrivalData.cost),
        notes: arrivalData.notes,
        supplierId: arrivalData.supplierId || undefined,
        paymentMethod: arrivalData.supplierId
          ? arrivalData.paymentMethod
          : undefined,
        createdBy: user?.id,
        newPrice:
          arrivalData.priceMode !== "none"
            ? Number(arrivalData.newPrice)
            : undefined,
        priceMode:
          arrivalData.priceMode !== "none" ? arrivalData.priceMode : undefined,
        productionDate: arrivalData.productionDate || undefined,
        expiryDate: arrivalData.expirationDate || undefined,
      });

      setShowArrival(false);
      loadProducts();
      toast.success(t("inventory.arrivalCreated"));
    } catch (error) {
      console.error("Failed to create arrival:", error);
      toast.error(t("common.error"));
    }
  };

  const getPaymentMethodLabel = (method: SupplierPaymentMethod) => {
    const labels: Record<SupplierPaymentMethod, string> = {
      CASH: t("suppliers.cash"),
      CARD: t("suppliers.card"),
      BANK_TRANSFER: t("suppliers.bankTransfer"),
      INSTALLMENT: t("suppliers.installment"),
      ONE_TO_ONE: t("suppliers.oneToOne"),
    };
    return labels[method];
  };

  const getProductName = (product: Product) =>
    i18n.language === "uz" ? product.nameUz : product.nameRu;

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const columns = [
    { key: "#", header: "#", render: (_: Product, index: number) => index + 1 },
    { key: "id", header: t("pos.id") },
    { key: "barcode", header: t("products.barcode") },
    {
      key: "name",
      header: t("products.name"),
      render: (product: Product) => getProductName(product),
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
        <Button size="small" onClick={() => handleAddArrival(product)}>
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
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("common.search")}
          style={{
            padding: "8px 16px",
            fontSize: "18px",
            fontWeight: "bold",
            flex: 1,
          }}
        />
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
        <Modal
          title={t("inventory.newArrival")}
          onClose={() => setShowArrival(false)}
        >
          <Form onSubmit={handleSubmitArrival}>
            <InfoRow>
              <InfoItem>
                <InfoLabel>{t("products.product")}</InfoLabel>
                <InfoValue>{getProductName(selectedProduct)}</InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>{t("products.currentStock")}</InfoLabel>
                <InfoValue>
                  {formatQuantity(
                    selectedProduct.stock,
                    selectedProduct.unit || "шт",
                    i18n.language as "ru" | "uz",
                  )}
                </InfoValue>
              </InfoItem>
            </InfoRow>

            <InfoRow>
              <InfoItem>
                <InfoLabel>{t("products.cost")}</InfoLabel>
                <InfoValue>
                  {selectedProduct.costPrice
                    ? formatCurrency(selectedProduct.costPrice)
                    : "—"}
                </InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>{t("products.price")}</InfoLabel>
                <InfoValue>{formatCurrency(selectedProduct.price)}</InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>{t("products.profitMargin")}</InfoLabel>
                <InfoValue>
                  {selectedProduct.costPrice ? (
                    <ProfitBadge
                      $negative={
                        ((selectedProduct.price - selectedProduct.costPrice) /
                          selectedProduct.costPrice) *
                          100 <
                        0
                      }
                    >
                      {(
                        ((selectedProduct.price - selectedProduct.costPrice) /
                          selectedProduct.costPrice) *
                        100
                      ).toFixed(1)}
                      %
                    </ProfitBadge>
                  ) : (
                    "—"
                  )}
                </InfoValue>
              </InfoItem>
            </InfoRow>

            {selectedProduct.pendingPrice != null && (
              <InfoRow>
                <InfoItem style={{ borderColor: "#ff9800" }}>
                  <InfoLabel>{t("inventory.pendingPriceLabel")}</InfoLabel>
                  <InfoValue>
                    {formatCurrency(selectedProduct.pendingPrice)}{" "}
                    <span style={{ fontSize: 12, fontWeight: 400 }}>
                      (
                      {t("inventory.afterStockDrops", {
                        threshold: `${selectedProduct.pendingPriceThreshold} ${selectedProduct.unit}`,
                      })}
                      )
                    </span>
                  </InfoValue>
                </InfoItem>
              </InfoRow>
            )}

            <Input
              label={t("inventory.quantity")}
              type="number"
              autoFocus
              value={arrivalData.quantity}
              onChange={(e) =>
                setArrivalData((prev) => ({
                  ...prev,
                  quantity: e.target.value,
                }))
              }
              required
            />

            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <Input
                  label={t("inventory.costPerUnit")}
                  type="number"
                  value={arrivalData.cost}
                  onChange={(e) =>
                    setArrivalData((prev) => ({
                      ...prev,
                      cost: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  label={`${t("products.price")}${profitMargin !== null ? ` (${profitMargin}%)` : ""}`}
                  type="number"
                  value={arrivalData.newPrice}
                  onChange={(e) =>
                    setArrivalData((prev) => ({
                      ...prev,
                      newPrice: e.target.value,
                    }))
                  }
                  disabled={arrivalData.priceMode === "none"}
                />
              </div>
            </div>

            {costChanged && (
              <PriceChangeSection>
                <PriceChangeTitle>
                  {t("inventory.priceChanged")}
                </PriceChangeTitle>

                <RadioOption $active={arrivalData.priceMode === "none"}>
                  <input
                    type="radio"
                    name="priceMode"
                    checked={arrivalData.priceMode === "none"}
                    onChange={() =>
                      setArrivalData((prev) => ({
                        ...prev,
                        priceMode: "none",
                        newPrice: String(selectedProduct!.price),
                      }))
                    }
                  />
                  <RadioText>
                    <RadioLabel>{t("inventory.keepCurrentPrice")}</RadioLabel>
                    <RadioDescription>
                      {formatCurrency(selectedProduct!.price)}
                    </RadioDescription>
                  </RadioText>
                </RadioOption>

                <RadioOption $active={arrivalData.priceMode === "immediate"}>
                  <input
                    type="radio"
                    name="priceMode"
                    checked={arrivalData.priceMode === "immediate"}
                    onChange={() =>
                      setArrivalData((prev) => ({
                        ...prev,
                        priceMode: "immediate",
                      }))
                    }
                  />
                  <RadioText>
                    <RadioLabel>
                      {t("inventory.changePriceImmediately")}
                    </RadioLabel>
                    <RadioDescription>
                      {t("inventory.changePriceImmediatelyDesc")}
                    </RadioDescription>
                  </RadioText>
                </RadioOption>

                <RadioOption $active={arrivalData.priceMode === "deferred"}>
                  <input
                    type="radio"
                    name="priceMode"
                    checked={arrivalData.priceMode === "deferred"}
                    onChange={() =>
                      setArrivalData((prev) => ({
                        ...prev,
                        priceMode: "deferred",
                      }))
                    }
                  />
                  <RadioText>
                    <RadioLabel>
                      {t("inventory.changePriceAfterOldStock")}
                    </RadioLabel>
                    <RadioDescription>
                      {t("inventory.changePriceAfterOldStockDesc", {
                        stock: `${selectedProduct!.stock} ${selectedProduct!.unit}`,
                      })}
                    </RadioDescription>
                  </RadioText>
                </RadioOption>
              </PriceChangeSection>
            )}

            <div style={{ display: "flex", gap: "16px" }}>
              {arrivalData.supplierId && (
                <FormGroup>
                  <Label>{t("suppliers.paymentMethod")}</Label>
                  <Select
                    value={arrivalData.paymentMethod}
                    onChange={(e) =>
                      setArrivalData((prev) => ({
                        ...prev,
                        paymentMethod: e.target.value as SupplierPaymentMethod,
                      }))
                    }
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {getPaymentMethodLabel(method)}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
              )}
              <FormGroup>
                <Label>{t("products.supplier")}</Label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Select
                    value={arrivalData.supplierId}
                    onChange={(e) =>
                      setArrivalData((prev) => ({
                        ...prev,
                        supplierId: e.target.value,
                      }))
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="">{t("products.noSupplier")}</option>
                    {suppliers.map((supplier: Supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {i18n.language === "uz"
                          ? supplier.nameUz
                          : supplier.nameRu}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => setShowSupplierModal(true)}
                    style={{ flexShrink: 0 }}
                  >
                    <Settings size={16} />
                  </Button>
                </div>
              </FormGroup>
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <DateInput
                  label={t("products.productionDate")}
                  value={arrivalData.productionDate}
                  onChange={(val) =>
                    setArrivalData((prev) => ({
                      ...prev,
                      productionDate: val,
                    }))
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <DateInput
                  label={t("products.expiryDate")}
                  value={arrivalData.expirationDate}
                  onChange={(val) =>
                    setArrivalData((prev) => ({
                      ...prev,
                      expirationDate: val,
                    }))
                  }
                />
              </div>
            </div>
            {arrivalData.expirationDate && (
              <InfoItem>
                {getExpireInDays(
                  t,
                  arrivalData.expirationDate,
                  arrivalData.expirationDate,
                )}
              </InfoItem>
            )}

            <Input
              label={t("inventory.notes")}
              value={arrivalData.notes}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, notes: e.target.value }))
              }
            />

            <Actions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowArrival(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </Actions>
          </Form>
        </Modal>
      )}
      {showSupplierModal && (
        <SupplierManagementModal
          onClose={() => setShowSupplierModal(false)}
          onSupplierChanged={loadSuppliers}
        />
      )}
    </Container>
  );
}
