import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { useAuthStore } from "../../store/auth-store";
import { useToast } from "../../context/ToastContext";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Modal } from "../../components/common/Modal";
import {
  Product,
  ProductUnit,
  Supplier,
  SupplierPaymentMethod,
} from "@shared/types";
import { convertUzbekText } from "@shared/utils/transliterator";

const Container = styled.div`
  max-width: 600px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
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

const ModalActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const PAYMENT_METHODS: SupplierPaymentMethod[] = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "INSTALLMENT",
  "ONE_TO_ONE",
];

export function ProductForm() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
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

  const isEdit = Boolean(id);
  const barcodeCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    barcode: "",
    nameRu: "",
    nameUz: "",
    price: "",
    cost: "",
    stock: "0",
    minStock: "0",
    unit: "шт" as ProductUnit,
    categoryId: "",
    supplierId: "",
    productionDate: "",
    expiryDate: "",
    discountPercent: "",
    isOnPromotion: false,
    active: true,
  });

  // Existing product found by barcode
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalData, setArrivalData] = useState({
    quantity: "",
    cost: "",
    notes: "",
    supplierId: "",
    paymentMethod: "INSTALLMENT" as SupplierPaymentMethod,
  });
  const [isSubmittingArrival, setIsSubmittingArrival] = useState(false);

  useEffect(() => {
    loadCategories();
    loadSuppliers();

    if (isEdit && id) {
      loadProduct();
    }
  }, [id, isEdit]);

  // Debounced barcode check
  const checkBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode || barcode.length < 3 || isEdit) return;

      const product = await searchByBarcode(barcode);
      if (product) {
        setExistingProduct(product);
        setShowArrivalModal(true);
        // Pre-fill arrival cost with product's current cost
        setArrivalData((prev) => ({
          ...prev,
          cost: product.costPrice ? String(product.costPrice) : "",
          supplierId: product.supplierId || "",
        }));
      }
    },
    [searchByBarcode, isEdit],
  );

  const handleBarcodeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, barcode: value }));

    // Clear previous timeout
    if (barcodeCheckTimeout.current) {
      clearTimeout(barcodeCheckTimeout.current);
    }

    // Debounce barcode check (500ms delay for typing, instant for scanner)
    if (value.length >= 8) {
      // Likely a scanned barcode - check immediately
      checkBarcode(value);
    } else if (value.length >= 3) {
      // User typing - debounce
      barcodeCheckTimeout.current = setTimeout(() => {
        checkBarcode(value);
      }, 800);
    }
  };

  const handleArrivalSubmit = async () => {
    if (!existingProduct || !arrivalData.quantity || !arrivalData.cost) return;

    setIsSubmittingArrival(true);
    try {
      await window.electronAPI.inventory.createArrival({
        productId: existingProduct.id,
        quantity: parseFloat(arrivalData.quantity),
        cost: parseFloat(arrivalData.cost),
        notes: arrivalData.notes || undefined,
        supplierId: arrivalData.supplierId || undefined,
        paymentMethod: arrivalData.supplierId
          ? arrivalData.paymentMethod
          : undefined,
        createdBy: user?.id,
      });

      toast.success(t("inventory.arrivalCreated") || t("common.saved"));
      setShowArrivalModal(false);
      setExistingProduct(null);
      setFormData((prev) => ({ ...prev, barcode: "" }));
      setArrivalData({
        quantity: "",
        cost: "",
        notes: "",
        supplierId: "",
        paymentMethod: "INSTALLMENT",
      });
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

  const loadProduct = async () => {
    if (!id) return;

    const product = await getById(id);
    if (product) {
      setFormData({
        barcode: product.barcode,
        nameRu: product.nameRu,
        nameUz: product.nameUz,
        price: String(product.price),
        cost: product.costPrice ? String(product.costPrice) : "",
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
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      barcode: formData.barcode,
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : null,
      stock: parseInt(formData.stock),
      minStock: parseInt(formData.minStock),
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
    };

    let success = false;
    if (isEdit && id) {
      success = await updateProduct(id, data);
      if (success) {
        toast.success(t("common.saved"));
      }
    } else {
      success = await createProduct(data);
      if (success) {
        toast.success(t("common.saved"));
      }
    }

    if (success) {
      navigate("/products");
    } else if (error) {
      toast.error(error);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Auto-transliterate between Uzbek Latin and Cyrillic
  const handleNameUzChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value); // Latin → Cyrillic
      return {
        ...prev,
        nameUz: value,
        // Only auto-fill if nameRu is empty or matches previous conversion
        nameRu:
          prev.nameRu === "" || prev.nameRu === convertUzbekText(prev.nameUz)
            ? converted
            : prev.nameRu,
      };
    });
  };

  const handleNameRuChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value); // Cyrillic → Latin
      return {
        ...prev,
        nameRu: value,
        // Only auto-fill if nameUz is empty or matches previous conversion
        nameUz:
          prev.nameUz === "" || prev.nameUz === convertUzbekText(prev.nameRu)
            ? converted
            : prev.nameUz,
      };
    });
  };

  return (
    <Container>
      <Title>
        {isEdit ? t("products.editProduct") : t("products.addProduct")}
      </Title>

      <Form onSubmit={handleSubmit}>
        <Input
          label={t("products.barcode")}
          value={formData.barcode}
          autoFocus
          onChange={(e) => handleBarcodeChange(e.target.value)}
          disabled={isEdit}
          required
        />

        <Row>
          <Input
            label={t("products.nameUz")}
            value={formData.nameUz}
            onChange={(e) => handleNameUzChange(e.target.value)}
            required
          />
          <Input
            label={t("products.nameRu")}
            value={formData.nameRu}
            onChange={(e) => handleNameRuChange(e.target.value)}
            required
          />
        </Row>

        <Row>
          <Input
            label={t("products.price")}
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

        <Row>
          <Input
            label={t("products.unit")}
            value={formData.unit}
            onChange={(e) => handleChange("unit", e.target.value)}
          />
          <FormGroup>
            <Label>{t("products.category")}</Label>
            <Select
              value={formData.categoryId}
              onChange={(e) => handleChange("categoryId", e.target.value)}
              required
            >
              <option value="">{t("products.selectCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameRu}
                </option>
              ))}
            </Select>
          </FormGroup>
        </Row>

        <FormGroup>
          <Label>{t("filters.supplier")}</Label>
          <Select
            value={formData.supplierId}
            onChange={(e) => handleChange("supplierId", e.target.value)}
          >
            <option value="">{t("filters.allSuppliers")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameRu}
              </option>
            ))}
          </Select>
        </FormGroup>

        <Row>
          <Input
            label={t("products.productionDate")}
            type="date"
            value={formData.productionDate}
            onChange={(e) => handleChange("productionDate", e.target.value)}
          />
          <Input
            label={t("products.expiryDate")}
            type="date"
            value={formData.expiryDate}
            onChange={(e) => handleChange("expiryDate", e.target.value)}
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/products")}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t("common.saving") : t("common.save")}
          </Button>
        </Actions>
      </Form>

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
              <ProductInfoValue>{existingProduct.price} {t("common.currency")}</ProductInfoValue>
            </ProductInfoRow>
          </ProductInfo>

          <ArrivalForm>
            <Input
              label={t("inventory.quantity")}
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

            <Input
              label={t("inventory.costPerUnit")}
              type="number"
              min="0"
              step="0.01"
              value={arrivalData.cost}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, cost: e.target.value }))
              }
              required
            />

            <FormGroup>
              <Label>{t("products.supplier")}</Label>
              <Select
                value={arrivalData.supplierId}
                onChange={(e) =>
                  setArrivalData((prev) => ({
                    ...prev,
                    supplierId: e.target.value,
                  }))
                }
              >
                <option value="">{t("products.noSupplier")}</option>
                {suppliers.map((supplier: Supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {i18n.language === "uz" ? supplier.nameUz : supplier.nameRu}
                  </option>
                ))}
              </Select>
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
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {getPaymentMethodLabel(method)}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            )}

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
    </Container>
  );
}
