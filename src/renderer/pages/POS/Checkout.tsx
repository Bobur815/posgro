import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCartStore } from '../../store/cart-store';
import { useSales } from '../../hooks/useSales';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';

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
  font-size: 18px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const TotalAmount = styled.div`
  font-size: 36px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
`;

const PaymentMethods = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PaymentButton = styled.button<{ $selected?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xl};
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary + '10' : theme.colors.surface};
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

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const SuccessMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const SuccessIcon = styled.div`
  font-size: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ReceiptNumber = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

interface CheckoutProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function Checkout({ onComplete, onCancel }: CheckoutProps) {
  const { t } = useTranslation();
  const { items, total, clearCart } = useCartStore();
  const { createSale, isLoading } = useSales();

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [success, setSuccess] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  const handlePayment = async () => {
    try {
      const saleData = {
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        paymentMethod,
        discountAmount: 0,
      };

      const sale = await createSale(saleData);

      if (sale) {
        setReceiptNumber(sale.receiptNumber);
        setSuccess(true);
        clearCart();

        // Auto close after 3 seconds
        setTimeout(() => {
          onComplete();
        }, 3000);
      }
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  if (success) {
    return (
      <Modal title={t('pos.paymentComplete')} onClose={onComplete}>
        <SuccessMessage>
          <SuccessIcon>✓</SuccessIcon>
          <div>{t('pos.thankYou')}</div>
          <ReceiptNumber>
            {t('pos.receiptNumber')}: {receiptNumber}
          </ReceiptNumber>
        </SuccessMessage>
        <Button fullWidth onClick={onComplete}>
          {t('common.close')}
        </Button>
      </Modal>
    );
  }

  return (
    <Modal title={t('pos.checkout')} onClose={onCancel}>
      <Content>
        <TotalSection>
          <TotalLabel>{t('pos.totalToPay')}</TotalLabel>
          <TotalAmount>{formatCurrency(total)}</TotalAmount>
        </TotalSection>

        <PaymentMethods>
          <PaymentButton
            $selected={paymentMethod === 'cash'}
            onClick={() => setPaymentMethod('cash')}
          >
            <PaymentIcon>💵</PaymentIcon>
            <PaymentLabel>{t('pos.cash')}</PaymentLabel>
          </PaymentButton>
          <PaymentButton
            $selected={paymentMethod === 'card'}
            onClick={() => setPaymentMethod('card')}
          >
            <PaymentIcon>💳</PaymentIcon>
            <PaymentLabel>{t('pos.card')}</PaymentLabel>
          </PaymentButton>
        </PaymentMethods>

        <Actions>
          <Button variant="secondary" onClick={onCancel} fullWidth>
            {t('common.cancel')}
          </Button>
          <Button onClick={handlePayment} disabled={isLoading} fullWidth>
            {isLoading ? t('common.processing') : t('pos.confirmPayment')}
          </Button>
        </Actions>
      </Content>
    </Modal>
  );
}
