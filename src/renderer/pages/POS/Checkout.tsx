import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useCartStore } from "../../store/cart-store";
import { useSales } from "../../hooks/useSales";
import { useToast } from "../../context/ToastContext";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";

function parseSaleError(err: unknown, t: (key: string, params?: Record<string, unknown>) => string): string {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message);
    if (parsed.code === 'PRODUCT_NOT_FOUND') {
      return t('errors.productNotFound', { id: parsed.productId });
    }
    if (parsed.code === 'PRODUCT_INACTIVE') {
      return t('errors.productInactive', { name: parsed.name });
    }
    if (parsed.code === 'INSUFFICIENT_STOCK') {
      return t('errors.insufficientStock', {
        name: parsed.name,
        available: parsed.available,
        requested: parsed.requested,
      });
    }
  } catch {
    // not JSON, fall through
  }
  return t('common.error');
}

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const TotalSection = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const TotalLabel = styled.div`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const TotalAmount = styled.div`
  font-size: 36px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
`;

const SummarySection = styled.div`
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xs} 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaymentMethods = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PaymentButton = styled.button<{ $selected?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xl};
  border: 2px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary + "15" : theme.colors.surface};
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const PaymentIcon = styled.span`
  font-size: 32px;
`;

const PaymentLabel = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const PrintCheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
  user-select: none;
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.primary};
`;

const ShortcutHint = styled.span`
  font-size: 12px;
  opacity: 0.6;
  font-weight: 500;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 2px 6px;
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

interface CheckoutProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function Checkout({ onComplete, onCancel }: CheckoutProps) {
  const { t, i18n } = useTranslation();
  const { items, subtotal, tax, discount, total, clearCart, editingSaleId } =
    useCartStore();
  const { createSale, updateSale, isLoading } = useSales();
  const toast = useToast();

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [printCheck, setPrintCheck] = useState(total >= 10000);

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString(
      i18n.language === "ru" ? "ru-RU" : "uz-UZ",
    );
    return i18n.language === "ru" ? `${formatted} сум` : `${formatted} so'm`;
  };

  const handlePaymentRef = useRef<() => void>();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault();
        handlePaymentRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePayment = async () => {
    if (isLoading) return;
    try {
      const saleData = {
        items: items.map((item) => ({
          productId: String(item.productId),
          productName: item.productName,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        paymentMethod,
        discountAmount: discount,
      };

      const sale = editingSaleId
        ? await updateSale(editingSaleId, saleData)
        : await createSale(saleData);

      if (sale) {
        clearCart();
        window.dispatchEvent(new Event("stock-updated"));
        toast.success(
          editingSaleId
            ? t("pos.saleUpdated")
            : `${t("pos.paymentComplete")} — ${t("pos.receiptNumber")}: ${sale.receiptNumber}`,
        );
        onComplete();
      }
    } catch (error) {
      console.error("Payment failed:", error);
      toast.error(parseSaleError(error, t));
      clearCart();
      onComplete();
    }
  };

  handlePaymentRef.current = handlePayment;

  return (
    <Modal title={t("pos.checkout")} onClose={onCancel}>
      <Content>
        <TotalSection>
          <TotalLabel>{t("pos.totalToPay")}</TotalLabel>
          <TotalAmount>{formatCurrency(total)}</TotalAmount>
        </TotalSection>

        <SummarySection>
          <SummaryRow>
            <span>{t("pos.subtotal")}</span>
            <span>{formatCurrency(subtotal)}</span>
          </SummaryRow>
          {tax > 0 && (
            <SummaryRow>
              <span>{t("pos.tax")}</span>
              <span>{formatCurrency(tax)}</span>
            </SummaryRow>
          )}
          {discount > 0 && (
            <SummaryRow>
              <span>{t("pos.discount")}</span>
              <span>-{formatCurrency(discount)}</span>
            </SummaryRow>
          )}
          <SummaryRow>
            <span>{t("pos.itemsCount")}</span>
            <span>{items.length}</span>
          </SummaryRow>
        </SummarySection>

        <PaymentMethods>
          <PaymentButton
            $selected={paymentMethod === "cash"}
            onClick={() => setPaymentMethod("cash")}
          >
            <PaymentIcon>💵</PaymentIcon>
            <PaymentLabel>{t("pos.cash")}</PaymentLabel>
          </PaymentButton>
          <PaymentButton
            $selected={paymentMethod === "card"}
            onClick={() => setPaymentMethod("card")}
          >
            <PaymentIcon>💳</PaymentIcon>
            <PaymentLabel>{t("pos.card")}</PaymentLabel>
          </PaymentButton>
        </PaymentMethods>

        <PrintCheckRow>
          <Checkbox
            type="checkbox"
            checked={printCheck}
            onChange={(e) => setPrintCheck(e.target.checked)}
          />
          {t("pos.printReceipt")}
        </PrintCheckRow>

        <Actions>
          <Button variant="secondary" onClick={onCancel} fullWidth>
            {t("common.cancel")}
          </Button>
          <Button onClick={handlePayment} disabled={isLoading} fullWidth>
            {isLoading ? t("common.processing") : t("pos.confirmPayment")}{" "}
            <ShortcutHint>F10</ShortcutHint>
          </Button>
        </Actions>
      </Content>
    </Modal>
  );
}
