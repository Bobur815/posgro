import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCartStore } from '../../store/cart-store';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyPlaceholder } from '../../components/common/EmptyPlaceholder';
import { Banknote, CreditCard, History, ShoppingCart, Trash, X } from 'lucide-react';
import { SalesHistoryModal } from './SalesHistoryModal';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { formatQuantity } from '../../utils/formatters';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Header = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const IconButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.primary}10;
  }
`;

const ClearButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const EditBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.warning}15;
  border-bottom: 1px solid ${({ theme }) => theme.colors.warning}40;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const EditBannerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const EditBannerLabel = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.warning};
  font-size: 12px;
  text-transform: uppercase;
`;

const EditBannerReceipt = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CancelEditButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;

  &:hover {
    color: ${({ theme }) => theme.colors.error};
    border-color: ${({ theme }) => theme.colors.error};
  }
`;

const ItemsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const CartItem = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const ItemRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ItemName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
`;

const ItemPrice = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: bold;
  font-size: 16px;
`;

const QuantityControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const QuantityButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary};
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Quantity = styled.span`
  min-width: 40px;
  text-align: center;
  font-weight: 500;
  font-size: 16px;
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 12px;
  margin-left: auto;

  &:hover {
    text-decoration: underline;
  }
`;

const Footer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.background};
`;

const TotalsSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TotalRow = styled.div<{ $bold?: boolean; $large?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs} 0;

  ${({ $bold }) => $bold && `font-weight: bold;`}
  ${({ $large }) => $large && `
    font-size: 22px;
    padding-top: 8px;
    margin-top: 8px;
    border-top: 2px solid currentColor;
  `}
`;

const TotalLabel = styled.span<{ $muted?: boolean }>`
  color: ${({ theme, $muted }) => $muted ? theme.colors.textSecondary : theme.colors.text};
`;

const TotalAmount = styled.span<{ $primary?: boolean; $negative?: boolean }>`
  color: ${({ theme, $primary, $negative }) =>
    $negative ? theme.colors.error :
    $primary ? theme.colors.primary :
    theme.colors.text};
`;

const QuickPayRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const QuickPayButton = styled.button<{ $variant: 'cash' | 'card' }>`
  height: 56px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'cash' ? theme.colors.success : theme.colors.primary};
  background-color: ${({ theme, $variant }) =>
    $variant === 'cash' ? theme.colors.success : theme.colors.primary};
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};

  &:hover {
    opacity: 0.9;
  }

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
`;

const ShortcutHint = styled.span`
  font-size: 14px;
  opacity: 0.7;
  font-weight: 500;
`;

interface CartProps {
  onCheckout: () => void;
  onQuickPay: (method: 'cash' | 'card') => void;
  isQuickPayDisabled: boolean;
}

export function Cart({ onCheckout, onQuickPay, isQuickPayDisabled }: CartProps) {
  const { t, i18n } = useTranslation();
  const { items, subtotal, tax, discount, total, updateQuantity, removeItem, clearCart, loadSaleForEdit, editingSaleId, editingSaleReceipt } = useCartStore();
  const formatCurrency = useCallback((amount: number) => formatCurrencyBase(amount, i18n.language as 'ru' | 'uz'), [i18n.language]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleEditSale = useCallback((sale: {
    id: string;
    receiptNumber: string;
    items: Array<{
      productId: string;
      productName: string;
      barcode: string;
      quantity: number;
      unitPrice: number;
    }>;
  }) => {
    const cartItems = sale.items.map((item) => ({
      productId: Number(item.productId),
      productName: item.productName,
      barcode: item.barcode,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      stock: item.quantity + 100,
      unit: undefined,
    }));
    loadSaleForEdit(sale.id, sale.receiptNumber, cartItems);
    setShowHistory(false);
  }, [loadSaleForEdit]);

  return (
    <Container>
      <Header>
        <Title>{t('pos.cart')} ({items.length})</Title>
        <HeaderActions>
          <IconButton onClick={() => setShowHistory(true)} title={t('pos.salesHistory')}>
            <History size={20} />
          </IconButton>
          {items.length > 0 && (
            <ClearButton onClick={() => setShowClearConfirm(true)}>| {t('common.clear')}</ClearButton>
          )}
        </HeaderActions>
      </Header>

      {editingSaleId && (
        <EditBanner>
          <EditBannerInfo>
            <EditBannerLabel>{t('pos.editingSale')}</EditBannerLabel>
            <EditBannerReceipt>#{editingSaleReceipt}</EditBannerReceipt>
          </EditBannerInfo>
          <CancelEditButton onClick={clearCart}>
            <X size={14} />
            {t('common.cancel')}
          </CancelEditButton>
        </EditBanner>
      )}

      {items.length === 0 ? (
        <EmptyPlaceholder icon={<ShoppingCart size={48} />} title={t('pos.emptyCart')} />
      ) : (
        <ItemsList>
          {items.map((item, index) => {
            const isWeighed = item.unit === 'кг' || item.unit === 'л';
            const step = isWeighed ? 0.1 : 1;

            return (
              <CartItem key={`${item.productId}-${item.unitPrice}`}>
                <ItemRow>
                  <ItemName>{item.productName}</ItemName>
                  <ItemPrice>{formatCurrency(item.unitPrice * item.quantity)}</ItemPrice>
                </ItemRow>
                <QuantityControls>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <QuantityButton
                      onClick={() => updateQuantity(item.productId, Math.round((item.quantity - step) * 100) / 100, item.unitPrice)}
                    >
                      -
                    </QuantityButton>
                    <Quantity>{formatQuantity(item.quantity, item.unit || 'шт', i18n.language as 'ru' | 'uz')}</Quantity>
                    <QuantityButton
                      onClick={() => updateQuantity(item.productId, Math.round((item.quantity + step) * 100) / 100, item.unitPrice)}
                      disabled={item.quantity >= item.stock}
                    >
                      +
                    </QuantityButton>
                    x
                    <ItemPrice>{formatCurrency(item.unitPrice)}</ItemPrice>
                  </div>
                  <RemoveButton onClick={() => removeItem(item.productId, item.unitPrice)}>
                    <Trash size={22} />
                  </RemoveButton>
                </QuantityControls>
              </CartItem>
            );
          })}
        </ItemsList>
      )}

      <Footer>
        <TotalsSection>
          <TotalRow>
            <TotalLabel $muted>{t('pos.subtotal')}:</TotalLabel>
            <TotalAmount>{formatCurrency(subtotal)}</TotalAmount>
          </TotalRow>
          {tax > 0 && (
            <TotalRow>
              <TotalLabel $muted>{t('pos.tax')}:</TotalLabel>
              <TotalAmount>{formatCurrency(tax)}</TotalAmount>
            </TotalRow>
          )}
          {discount > 0 && (
            <TotalRow>
              <TotalLabel $muted>{t('pos.discount')}:</TotalLabel>
              <TotalAmount $negative>-{formatCurrency(discount)}</TotalAmount>
            </TotalRow>
          )}
          <TotalRow $bold $large>
            <TotalLabel>{t('pos.total')}:</TotalLabel>
            <TotalAmount $primary>{formatCurrency(total)}</TotalAmount>
          </TotalRow>
        </TotalsSection>
        <Button
          fullWidth
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          {editingSaleId ? t('pos.save') : t('pos.pay') + ' - ' + formatCurrency(total)}
          {' '}<ShortcutHint>(F10)</ShortcutHint>
        </Button>
        <QuickPayRow>
          <QuickPayButton
            $variant="cash"
            onClick={() => onQuickPay('cash')}
            disabled={items.length === 0 || isQuickPayDisabled}
          >
            <Banknote size={24} />
            {t('pos.cash')}
            <ShortcutHint>(F11)</ShortcutHint>
          </QuickPayButton>
          <QuickPayButton
            $variant="card"
            onClick={() => onQuickPay('card')}
            disabled={items.length === 0 || isQuickPayDisabled}
          >
            <CreditCard size={24} />
            {t('pos.card')}
            <ShortcutHint>(F12)</ShortcutHint>
          </QuickPayButton>
        </QuickPayRow>
      </Footer>

      {showHistory && (
        <SalesHistoryModal onClose={() => setShowHistory(false)} onEditSale={handleEditSale} />
      )}

      {showClearConfirm && (
        <ConfirmDialog
          title={t('common.clear')}
          message={t('pos.clearCartConfirm', 'Are you sure you want to clear the cart?')}
          confirmLabel={t('common.clear')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={() => {
            clearCart();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </Container>
  );
}
