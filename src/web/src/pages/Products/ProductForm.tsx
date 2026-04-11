import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { generateProductBarcode } from "@shared/utils/barcode-parser";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { useToast } from "@context/ToastContext";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { Modal } from "@components/common/Modal";
import { DateInput } from "@components/common/DateInput";
import { BarcodeScannerModal } from "../../components/common/BarcodeScannerModal";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import {
  Product,
  ProductType,
  ProductUnit,
  Supplier,
  SupplierPaymentMethod,
} from "@shared/types";
import {
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_I18N_KEYS,
} from "@shared/constants/payment-methods";
import { convertUzbekText } from "@shared/utils/transliterator";
import { Camera, RefreshCw, Settings } from "lucide-react";
import { SupplierManagementModal } from "../Suppliers/SupplierManagementModal";
import { CategoryManagementModal } from "./CategoryManagementModal";
import { inventory, products as productsApi, mxik as mxikApi } from "../../api/client";

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ThreeColRow = styled(Row)`
  grid-template-columns: 1fr 1fr 1fr;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const ProductInfo = styled.div`
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ProductInfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xs} 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const ProductInfoLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProductInfoValue = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const ArrivalForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FlexRow = styled.div`
  display: flex;
  gap: 16px;

  > div {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 640px) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.md};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ProfitBadge = styled.span<{ $negative?: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme, $negative }) =>
    $negative ? theme.colors.error : theme.colors.success};
`;

const Req = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
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

const UNIT_OPTIONS: ProductUnit[] = ["шт", "кг", "л", "м"];

interface ProductFormProps {
  productId?: string;
  initialData?: {
    nameRu?: string;
    nameUz?: string;
    mxik?: string;
    cost?: number;
    stock?: number;
    internalCode?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductForm({
  productId,
  initialData,
  onClose,
  onSuccess,
}: ProductFormProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuthStore();
  const {
    getById,
    searchByBarcode,
    createProduct,
    updateProduct,
    categories,
    suppliers,
    loadCategories,
    loadSuppliers,
    isLoading,
    error,
  } = useProducts();

  const isEdit = Boolean(productId);
  const barcodeCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isMobile = window.matchMedia("(pointer: coarse)").matches;

  const [formData, setFormData] = useState({
    barcode: "",
    nameRu: initialData?.nameRu || "",
    nameUz: initialData?.nameUz || "",
    price: "",
    cost: initialData?.cost ? String(initialData.cost) : "",
    stock: initialData?.stock ? String(initialData.stock) : "0",
    minStock: "0",
    unit: "шт" as ProductUnit,
    categoryId: "",
    supplierId: "",
    productionDate: "",
    expiryDate: "",
    discountPercent: "",
    isOnPromotion: false,
    active: true,
    mxik: initialData?.mxik || "",
    productType: "REGULAR" as ProductType,
    internalCode: initialData?.internalCode || "",
  });

  const [existingProduct, setExistingProduct] = useState<Product | null>(null);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalData, setArrivalData] = useState({
    quantity: "",
    cost: "",
    newPrice: "",
    priceMode: "none" as "none" | "immediate" | "deferred",
    notes: "",
    supplierId: "",
    paymentMethod: "CASH" as SupplierPaymentMethod,
    productionDate: "",
    expirationDate: "",
  });
  const [isSubmittingArrival, setIsSubmittingArrival] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadCategories();
    loadSuppliers();

    if (isEdit && productId) {
      loadProduct();
    }
  }, [productId, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    if (formData.productType === "REGULAR") {
      setFormData((prev) => ({ ...prev, internalCode: "" }));
      return;
    }
    productsApi.getNextInternalCode().then((code) => {
      setFormData((prev) => ({ ...prev, internalCode: code }));
    });
  }, [formData.productType, isEdit]);

  /** Extract EAN-13 from a GS1 DataMatrix QR payload, or return the value as-is. */
  function extractEan13(raw: string): string {
    const gs1 = raw.match(/\(01\)(\d{14})/) ?? raw.match(/^01(\d{14})/);
    if (gs1) {
      const gtin = gs1[1];
      const ean13 = gtin.startsWith("0") ? gtin.slice(1) : gtin;
      if (ean13.length === 13) return ean13;
    }
    return raw;
  }

  const checkBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode || barcode.length < 3 || isEdit) return;

      const product = await searchByBarcode(barcode);
      if (product) {
        setExistingProduct(product);
        setShowArrivalModal(true);
        setArrivalData((prev) => ({
          ...prev,
          cost: product.cost ? String(product.cost) : "",
          newPrice: String(product.price),
          priceMode: "none",
          supplierId: product.supplierId || "",
          productionDate: product.productionDate
            ? product.productionDate.split("T")[0]
            : "",
          expirationDate: product.expiryDate
            ? product.expiryDate.split("T")[0]
            : "",
        }));
      } else {
        // Not in local DB — look up in tasnif registry using clean EAN-13
        try {
          const info = await mxikApi.searchByBarcode(extractEan13(barcode));
          setFormData((prev) => ({
            ...prev,
            mxik: info.code,
            nameUz: info.name,
            nameRu: info.nameRu,
          }));
        } catch {
          // Not found in tasnif either — user fills manually
        }
      }
    },
    [searchByBarcode, isEdit],
  );

  const handleGenerateBarcode = () => {
    const code = generateProductBarcode();
    setFormData((prev) => ({ ...prev, barcode: code }));
  };

  const handleBarcodeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, barcode: value }));

    if (barcodeCheckTimeout.current) {
      clearTimeout(barcodeCheckTimeout.current);
    }

    if (value.length >= 8) {
      barcodeCheckTimeout.current = setTimeout(() => {
        checkBarcode(value);
      }, 300);
    } else if (value.length >= 3) {
      barcodeCheckTimeout.current = setTimeout(() => {
        checkBarcode(value);
      }, 800);
    }
  };

  const handleScanResult = (raw: string) => {
    setShowScanner(false);
    const barcode = extractEan13(raw);
    setFormData((prev) => ({ ...prev, barcode }));
    checkBarcode(barcode);
  };

  const costChanged =
    existingProduct &&
    arrivalData.cost !== "" &&
    Number(arrivalData.cost) !== (existingProduct.cost ?? 0);

  const arrivalProfitMargin =
    arrivalData.cost && arrivalData.newPrice
      ? (
          ((Number(arrivalData.newPrice) - Number(arrivalData.cost)) /
            Number(arrivalData.cost)) *
          100
        ).toFixed(1)
      : null;

  const handleArrivalSubmit = async () => {
    if (!existingProduct || !arrivalData.quantity || !arrivalData.cost) return;

    setIsSubmittingArrival(true);
    try {
      await inventory.createArrival({
        productId: existingProduct.id,
        quantity: parseFloat(arrivalData.quantity),
        cost: parseFloat(arrivalData.cost),
        notes: arrivalData.notes || undefined,
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

      toast.success(t("inventory.arrivalCreated") || t("common.saved"));
      setShowArrivalModal(false);
      setExistingProduct(null);
      setFormData((prev) => ({ ...prev, barcode: "" }));
      setArrivalData({
        quantity: "",
        cost: "",
        newPrice: "",
        priceMode: "none",
        notes: "",
        supplierId: "",
        paymentMethod: "CASH",
        productionDate: "",
        expirationDate: "",
      });
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsSubmittingArrival(false);
    }
  };

  const handleCloseArrivalModal = () => {
    setShowArrivalModal(false);
    setExistingProduct(null);
    setFormData((prev) => ({ ...prev, barcode: "" }));
  };

  const getUnitLabel = (unit: ProductUnit) => {
    const labels: Record<ProductUnit, string> = {
      шт: t("units.piece"),
      кг: t("units.kg"),
      л: t("units.liter"),
      м: t("units.meter"),
    };
    return labels[unit];
  };

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const formProfitMargin =
    formData.price && formData.cost
      ? (
          ((Number(formData.price) - Number(formData.cost)) /
            Number(formData.cost)) *
          100
        ).toFixed(1)
      : null;

  const loadProduct = async () => {
    if (!productId) return;

    const product = await getById(productId);
    if (product) {
      setFormData({
        barcode: product.barcode,
        nameRu: product.nameRu,
        nameUz: product.nameUz,
        price: String(product.price),
        cost: product.cost ? String(product.cost) : "",
        stock: String(product.stock),
        minStock: String(product.minStock),
        unit: product.unit,
        categoryId: String(product.categoryId),
        supplierId: product.supplierId || "",
        productionDate: product.productionDate
          ? product.productionDate.split("T")[0]
          : "",
        expiryDate: product.expiryDate ? product.expiryDate.split("T")[0] : "",
        discountPercent:
          product.discountPercent != null
            ? String(product.discountPercent)
            : "",
        isOnPromotion: product.isOnPromotion ?? false,
        active: product.isActive,
        mxik: product.mxik || "",
        productType: product.productType || "REGULAR",
        internalCode: product.internalCode || "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // When editing, omit `stock` — stock is managed by inventory arrivals and
    // sales only. Including it here would overwrite any changes that occurred
    // (arrivals, sales) between when the form was loaded and when it is saved.
    const data = {
      barcode: formData.barcode,
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : undefined,
      ...(isEdit ? {} : { stock: parseFloat(formData.stock) || 0 }),
      minStock: parseFloat(formData.minStock) || 0,
      unit: formData.unit,
      categoryId: Number(formData.categoryId),
      supplierId: formData.supplierId || undefined,
      productionDate: formData.productionDate || undefined,
      expiryDate: formData.expiryDate || undefined,
      discountPercent: formData.discountPercent
        ? parseFloat(formData.discountPercent)
        : 0,
      isOnPromotion: formData.isOnPromotion,
      active: formData.active,
      mxik: formData.mxik || undefined,
      productType: formData.productType,
      internalCode: formData.internalCode || undefined,
    };

    let success = false;
    if (isEdit && productId) {
      success = await updateProduct(productId, data);
      if (success) toast.success(t("common.saved"));
    } else {
      success = await createProduct(data);
      if (success) toast.success(t("common.saved"));
    }

    if (success) {
      onSuccess();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  const handleNameUzChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameUz: value,
        nameRu:
          prev.nameRu === "" || prev.nameRu === convertUzbekText(prev.nameUz)
            ? converted
            : prev.nameRu,
      };
    });
  };

  const handleNameRuChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameRu: value,
        nameUz:
          prev.nameUz === "" || prev.nameUz === convertUzbekText(prev.nameRu)
            ? converted
            : prev.nameUz,
      };
    });
  };

  const title = isEdit ? t("products.edit") : t("products.add");

  return (
    <>
      <Modal title={title} onClose={onClose} width="750px">
        <Form onSubmit={handleSubmit}>
          <Row>
            <FormGroup>
              <Label>{t("products.mxik")}</Label>
              <div style={{ display: "flex", gap: "8px" }}>
                <Input
                  value={formData.mxik}
                  placeholder="00000000000000000"
                  onChange={(e) => handleChange("mxik", e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </FormGroup>
            <FormGroup>
              <Label>
                {t("products.barcode")} <Req>*</Req>
              </Label>
              <div
                style={{ display: "flex", flexDirection: "row", gap: "8px" }}
              >
                <Input
                  value={formData.barcode}
                  autoFocus
                  onChange={(e) => handleBarcodeChange(e.target.value)}
                  disabled={isEdit}
                  required
                  style={{ flex: 1 }}
                />
                {!isEdit && (
                  <>
                    {isMobile && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        onClick={() => setShowScanner(true)}
                        title={t("scanner.title") || "Scan barcode"}
                        style={{ flexShrink: 0 }}
                      >
                        <Camera size={16} />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      onClick={handleGenerateBarcode}
                      title={t("products.generateBarcode")}
                      style={{ flexShrink: 0 }}
                    >
                      <RefreshCw size={16} />
                    </Button>
                  </>
                )}
              </div>
            </FormGroup>
          </Row>

          <Row>
            <Input
              label={
                <>
                  {t("products.nameUz")} <Req>*</Req>
                </>
              }
              value={formData.nameUz}
              onChange={(e) => handleNameUzChange(e.target.value)}
              required
            />
            <Input
              label={
                <>
                  {t("products.nameRu")} <Req>*</Req>
                </>
              }
              value={formData.nameRu}
              onChange={(e) => handleNameRuChange(e.target.value)}
              required
            />
          </Row>

          <Row>
            <Input
              label={
                <>
                  {t("products.price")}
                  {formProfitMargin !== null
                    ? ` (${formProfitMargin}%)`
                    : ""}{" "}
                  <Req>*</Req>
                </>
              }
              type="number"
              value={formData.price}
              onChange={(e) => handleChange("price", e.target.value)}
              required
            />
            <Input
              label={t("products.cost")}
              type="number"
              value={formData.cost}
              onChange={(e) => handleChange("cost", e.target.value)}
            />
          </Row>

          <Row>
            <Input
              label={t("products.stock")}
              type="number"
              step={formData.productType === "BULK_WEIGHTED" || formData.productType === "PREPACKAGED" ? "0.001" : "1"}
              value={formData.stock}
              onChange={(e) => handleChange("stock", e.target.value)}
            />
            <Input
              label={t("products.minStock")}
              type="number"
              value={formData.minStock}
              onChange={(e) => handleChange("minStock", e.target.value)}
            />
          </Row>

          <ThreeColRow>
            <FormGroup>
              <Label>{t("products.productType")}</Label>
              <Select
                value={formData.productType}
                onChange={(e) =>
                  handleChange("productType", e.target.value as ProductType)
                }
              >
                <option value="REGULAR">
                  {t("products.productTypeRegular")}
                </option>
                <option value="BULK_WEIGHTED">
                  {t("products.productTypeBulkWeighted")}
                </option>
                <option value="PREPACKAGED">
                  {t("products.productTypePrepackaged")}
                </option>
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t("products.unit")}</Label>
              <Select
                value={formData.unit}
                onChange={(e) => handleChange("unit", e.target.value)}
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {getUnitLabel(unit)}
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>
                {t("products.category")} <Req>*</Req>
              </Label>
              <div style={{ display: "flex", gap: "8px" }}>
                <Select
                  value={formData.categoryId}
                  onChange={(e) => handleChange("categoryId", e.target.value)}
                  required
                  style={{ flex: 1 }}
                >
                  <option value="">{t("products.selectCategory")}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {i18n.language === "uz" ? cat.nameUz : cat.nameRu}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setShowCategoryModal(true)}
                  style={{ flexShrink: 0 }}
                >
                  <Settings size={16} />
                </Button>
              </div>
            </FormGroup>
          </ThreeColRow>

          {formData.productType !== "REGULAR" && (
            <Row>
              <Input
                label={t("products.internalCode")}
                value={formData.internalCode}
                readOnly
                style={{ background: "var(--color-surface)", cursor: "default" }}
                onChange={() => {}}
              />
              <div />
            </Row>
          )}

          <FormGroup>
            <Label>{t("filters.supplier")}</Label>
            <div style={{ display: "flex", gap: "8px" }}>
              <Select
                value={formData.supplierId}
                onChange={(e) => handleChange("supplierId", e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">{t("products.noSupplier")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {i18n.language === "uz" ? s.nameUz : s.nameRu}
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

          <Row>
            <DateInput
              label={t("products.productionDate")}
              value={formData.productionDate}
              onChange={(val) => handleChange("productionDate", val)}
            />
            <DateInput
              label={t("products.expiryDate")}
              value={formData.expiryDate}
              onChange={(val) => handleChange("expiryDate", val)}
            />
          </Row>

          <Row>
            <Input
              label={t("filters.discount")}
              type="number"
              min="0"
              max="100"
              value={formData.discountPercent}
              onChange={(e) => handleChange("discountPercent", e.target.value)}
            />
            <FormGroup>
              <Label>{t("filters.isOnPromotion")}</Label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.isOnPromotion}
                  onChange={(e) =>
                    handleChange("isOnPromotion", e.target.checked)
                  }
                />
                {t("filters.onPromotion")}
              </label>
            </FormGroup>
          </Row>

          <Actions>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("common.saving") : t("common.save")}
            </Button>
          </Actions>
        </Form>
      </Modal>

      {showScanner && (
        <BarcodeScannerModal
          onScan={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}


      {showArrivalModal && existingProduct && (
        <Modal
          title={t("inventory.productExists") || "Product Exists"}
          onClose={handleCloseArrivalModal}
        >
          <ProductInfo>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.name")}</ProductInfoLabel>
              <ProductInfoValue>
                {i18n.language === "uz"
                  ? existingProduct.nameUz
                  : existingProduct.nameRu}
              </ProductInfoValue>
            </ProductInfoRow>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.barcode")}</ProductInfoLabel>
              <ProductInfoValue>{existingProduct.barcode}</ProductInfoValue>
            </ProductInfoRow>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.currentStock")}</ProductInfoLabel>
              <ProductInfoValue>
                {existingProduct.stock} {existingProduct.unit}
              </ProductInfoValue>
            </ProductInfoRow>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.price")}</ProductInfoLabel>
              <ProductInfoValue>
                {formatCurrency(existingProduct.price)}
              </ProductInfoValue>
            </ProductInfoRow>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.cost")}</ProductInfoLabel>
              <ProductInfoValue>
                {existingProduct.cost
                  ? formatCurrency(existingProduct.cost)
                  : "—"}
              </ProductInfoValue>
            </ProductInfoRow>
            <ProductInfoRow>
              <ProductInfoLabel>{t("products.profitMargin")}</ProductInfoLabel>
              <ProductInfoValue>
                {existingProduct.cost ? (
                  <ProfitBadge
                    $negative={
                      ((existingProduct.price - existingProduct.cost) /
                        existingProduct.cost) *
                        100 <
                      0
                    }
                  >
                    {(
                      ((existingProduct.price - existingProduct.cost) /
                        existingProduct.cost) *
                      100
                    ).toFixed(1)}
                    %
                  </ProfitBadge>
                ) : (
                  "—"
                )}
              </ProductInfoValue>
            </ProductInfoRow>
          </ProductInfo>

          {existingProduct.pendingPrice != null && (
            <ProductInfo>
              <ProductInfoRow>
                <ProductInfoLabel>
                  {t("inventory.pendingPriceLabel")}
                </ProductInfoLabel>
                <ProductInfoValue>
                  {formatCurrency(existingProduct.pendingPrice)}{" "}
                  <span style={{ fontSize: 12, fontWeight: 400 }}>
                    (
                    {t("inventory.afterStockDrops", {
                      threshold: `${existingProduct.pendingPriceThreshold} ${existingProduct.unit}`,
                    })}
                    )
                  </span>
                </ProductInfoValue>
              </ProductInfoRow>
            </ProductInfo>
          )}

          <ArrivalForm>
            <Input
              label={
                <>
                  {t("inventory.quantity")} <Req>*</Req>
                </>
              }
              type="number"
              autoFocus
              min="0"
              step="0.01"
              value={arrivalData.quantity}
              onChange={(e) =>
                setArrivalData((prev) => ({
                  ...prev,
                  quantity: e.target.value,
                }))
              }
              required
            />

            <FlexRow>
              <div>
                <Input
                  label={
                    <>
                      {t("inventory.costPerUnit")} <Req>*</Req>
                    </>
                  }
                  type="number"
                  min="0"
                  step="0.01"
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
              <div>
                <Input
                  label={`${t("products.price")}${arrivalProfitMargin !== null ? ` (${arrivalProfitMargin}%)` : ""}`}
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
            </FlexRow>

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
                        newPrice: String(existingProduct!.price),
                      }))
                    }
                  />
                  <RadioText>
                    <RadioLabel>{t("inventory.keepCurrentPrice")}</RadioLabel>
                    <RadioDescription>
                      {formatCurrency(existingProduct!.price)}
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
                        stock: `${existingProduct!.stock} ${existingProduct!.unit}`,
                      })}
                    </RadioDescription>
                  </RadioText>
                </RadioOption>
              </PriceChangeSection>
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
                  {SUPPLIER_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {t(SUPPLIER_PAYMENT_METHOD_I18N_KEYS[method])}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            )}

            <FlexRow>
              <div>
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
              <div>
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
            </FlexRow>

            <Input
              label={t("inventory.notes")}
              value={arrivalData.notes}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, notes: e.target.value }))
              }
            />

            <ModalActions>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseArrivalModal}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleArrivalSubmit}
                disabled={
                  isSubmittingArrival ||
                  !arrivalData.quantity ||
                  !arrivalData.cost
                }
              >
                {isSubmittingArrival
                  ? t("common.saving")
                  : t("inventory.addArrival")}
              </Button>
            </ModalActions>
          </ArrivalForm>
        </Modal>
      )}

      {showSupplierModal && (
        <SupplierManagementModal
          onClose={() => setShowSupplierModal(false)}
          onSupplierChanged={loadSuppliers}
        />
      )}

      {showCategoryModal && (
        <CategoryManagementModal
          onClose={() => setShowCategoryModal(false)}
          onCategoryChanged={loadCategories}
        />
      )}
    </>
  );
}
