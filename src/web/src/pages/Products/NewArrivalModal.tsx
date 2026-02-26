import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { DateInput } from "@components/common/DateInput";
import { Product, Supplier, SupplierPaymentMethod } from "@shared/types";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { formatQuantity } from "../../utils/formatters";
import { getExpireInDays } from "../../utils/helpers";
import { Settings } from "lucide-react";
import { inventory as inventoryApi } from "../../api/client";

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
  border: 1px solid ${({ theme, $active }) =>
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

const RadioText = styled.div`flex: 1;`;
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
  "CASH", "CARD", "BANK_TRANSFER", "INSTALLMENT", "ONE_TO_ONE",
];

interface ArrivalData {
  quantity: string;
  cost: string;
  newPrice: string;
  priceMode: "none" | "immediate" | "deferred";
  notes: string;
  supplierId: string;
  productionDate: string;
  expirationDate: string;
  paymentMethod: SupplierPaymentMethod;
}

interface NewArrivalModalProps {
  product: Product;
  suppliers: Supplier[];
  userId?: string;
  onClose: () => void;
  onSuccess: () => void;
  onOpenSupplierModal: () => void;
}

export function NewArrivalModal({
  product, suppliers, userId, onClose, onSuccess, onOpenSupplierModal,
}: NewArrivalModalProps) {
  const { t, i18n } = useTranslation();

  const [arrivalData, setArrivalData] = useState<ArrivalData>({
    quantity: "",
    cost: product.costPrice ? String(product.costPrice) : "",
    newPrice: String(product.price),
    priceMode: "none",
    notes: "",
    supplierId: product.supplierId || "",
    productionDate: product.productionDate ? product.productionDate.slice(0, 10) : "",
    expirationDate: product.expiryDate ? product.expiryDate.slice(0, 10) : "",
    paymentMethod: "CASH",
  });

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const getProductName = (p: Product) =>
    i18n.language === "uz" ? p.nameUz : p.nameRu;

  const getPaymentMethodLabel = (method: SupplierPaymentMethod) => {
    const labels: Record<SupplierPaymentMethod, string> = {
      CASH: t("suppliers.cash"), CARD: t("suppliers.card"),
      BANK_TRANSFER: t("suppliers.bankTransfer"), INSTALLMENT: t("suppliers.installment"),
      ONE_TO_ONE: t("suppliers.oneToOne"),
    };
    return labels[method];
  };

  const costChanged =
    arrivalData.cost !== "" &&
    Number(arrivalData.cost) !== (product.costPrice ?? 0);

  const profitMargin =
    arrivalData.cost && arrivalData.newPrice
      ? (((Number(arrivalData.newPrice) - Number(arrivalData.cost)) / Number(arrivalData.cost)) * 100).toFixed(1)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inventoryApi.createArrival({
        productId: product.id,
        quantity: parseFloat(arrivalData.quantity),
        cost: parseFloat(arrivalData.cost),
        notes: arrivalData.notes,
        supplierId: arrivalData.supplierId || undefined,
        paymentMethod: arrivalData.supplierId ? arrivalData.paymentMethod : undefined,
        createdBy: userId,
        newPrice: arrivalData.priceMode !== "none" ? Number(arrivalData.newPrice) : undefined,
        priceMode: arrivalData.priceMode !== "none" ? arrivalData.priceMode : undefined,
        productionDate: arrivalData.productionDate || undefined,
        expiryDate: arrivalData.expirationDate || undefined,
      });
      onSuccess();
    } catch (error) {
      console.error("Failed to create arrival:", error);
      throw error;
    }
  };

  return (
    <Modal title={t("inventory.newArrival")} onClose={onClose}>
      <Form onSubmit={handleSubmit}>
        <InfoRow>
          <InfoItem>
            <InfoLabel>{t("products.product")}</InfoLabel>
            <InfoValue>{getProductName(product)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t("products.currentStock")}</InfoLabel>
            <InfoValue>
              {formatQuantity(product.stock, product.unit || "шт", i18n.language as "ru" | "uz")}
            </InfoValue>
          </InfoItem>
        </InfoRow>

        <InfoRow>
          <InfoItem>
            <InfoLabel>{t("products.cost")}</InfoLabel>
            <InfoValue>{product.costPrice ? formatCurrency(product.costPrice) : "—"}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t("products.price")}</InfoLabel>
            <InfoValue>{formatCurrency(product.price)}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t("products.profitMargin")}</InfoLabel>
            <InfoValue>
              {product.costPrice ? (
                <ProfitBadge $negative={((product.price - product.costPrice) / product.costPrice) * 100 < 0}>
                  {(((product.price - product.costPrice) / product.costPrice) * 100).toFixed(1)}%
                </ProfitBadge>
              ) : "—"}
            </InfoValue>
          </InfoItem>
        </InfoRow>

        <Input
          label={t("inventory.quantity")} type="number" autoFocus
          value={arrivalData.quantity}
          onChange={(e) => setArrivalData((prev) => ({ ...prev, quantity: e.target.value }))}
          required
        />

        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <Input
              label={t("inventory.costPerUnit")} type="number"
              value={arrivalData.cost}
              onChange={(e) => setArrivalData((prev) => ({ ...prev, cost: e.target.value }))}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              label={`${t("products.price")}${profitMargin !== null ? ` (${profitMargin}%)` : ""}`}
              type="number" value={arrivalData.newPrice}
              onChange={(e) => setArrivalData((prev) => ({ ...prev, newPrice: e.target.value }))}
              disabled={arrivalData.priceMode === "none"}
            />
          </div>
        </div>

        {costChanged && (
          <PriceChangeSection>
            <PriceChangeTitle>{t("inventory.priceChanged")}</PriceChangeTitle>
            <RadioOption $active={arrivalData.priceMode === "none"}>
              <input type="radio" name="priceMode" checked={arrivalData.priceMode === "none"}
                onChange={() => setArrivalData((prev) => ({ ...prev, priceMode: "none", newPrice: String(product.price) }))} />
              <RadioText>
                <RadioLabel>{t("inventory.keepCurrentPrice")}</RadioLabel>
                <RadioDescription>{formatCurrency(product.price)}</RadioDescription>
              </RadioText>
            </RadioOption>
            <RadioOption $active={arrivalData.priceMode === "immediate"}>
              <input type="radio" name="priceMode" checked={arrivalData.priceMode === "immediate"}
                onChange={() => setArrivalData((prev) => ({ ...prev, priceMode: "immediate" }))} />
              <RadioText>
                <RadioLabel>{t("inventory.changePriceImmediately")}</RadioLabel>
                <RadioDescription>{t("inventory.changePriceImmediatelyDesc")}</RadioDescription>
              </RadioText>
            </RadioOption>
            <RadioOption $active={arrivalData.priceMode === "deferred"}>
              <input type="radio" name="priceMode" checked={arrivalData.priceMode === "deferred"}
                onChange={() => setArrivalData((prev) => ({ ...prev, priceMode: "deferred" }))} />
              <RadioText>
                <RadioLabel>{t("inventory.changePriceAfterOldStock")}</RadioLabel>
                <RadioDescription>{t("inventory.changePriceAfterOldStockDesc", { stock: `${product.stock} ${product.unit}` })}</RadioDescription>
              </RadioText>
            </RadioOption>
          </PriceChangeSection>
        )}

        <div style={{ display: "flex", gap: "16px" }}>
          {arrivalData.supplierId && (
            <FormGroup>
              <Label>{t("suppliers.paymentMethod")}</Label>
              <Select value={arrivalData.paymentMethod}
                onChange={(e) => setArrivalData((prev) => ({ ...prev, paymentMethod: e.target.value as SupplierPaymentMethod }))}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{getPaymentMethodLabel(method)}</option>
                ))}
              </Select>
            </FormGroup>
          )}
          <FormGroup>
            <Label>{t("products.supplier")}</Label>
            <div style={{ display: "flex", gap: "8px" }}>
              <Select value={arrivalData.supplierId} style={{ flex: 1 }}
                onChange={(e) => setArrivalData((prev) => ({ ...prev, supplierId: e.target.value }))}>
                <option value="">{t("products.noSupplier")}</option>
                {suppliers.map((supplier: Supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {i18n.language === "uz" ? supplier.nameUz : supplier.nameRu}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" size="small" onClick={onOpenSupplierModal} style={{ flexShrink: 0 }}>
                <Settings size={16} />
              </Button>
            </div>
          </FormGroup>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <DateInput label={t("products.productionDate")} value={arrivalData.productionDate}
              onChange={(val) => setArrivalData((prev) => ({ ...prev, productionDate: val }))} />
          </div>
          <div style={{ flex: 1 }}>
            <DateInput label={t("products.expiryDate")} value={arrivalData.expirationDate}
              onChange={(val) => setArrivalData((prev) => ({ ...prev, expirationDate: val }))} />
          </div>
        </div>

        <Input label={t("inventory.notes")} value={arrivalData.notes}
          onChange={(e) => setArrivalData((prev) => ({ ...prev, notes: e.target.value }))} />

        <Actions>
          <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit">{t("common.save")}</Button>
        </Actions>
      </Form>
    </Modal>
  );
}
