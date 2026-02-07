import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCartStore } from '../../store/cart-store';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyPlaceholder } from '../../components/common/EmptyPlaceholder';
import { ShoppingCart, Trash } from 'lucide-react';
import { formatCurrency } from '@shared/utils';

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
  font-size: 14px;
`;

const ItemPrice = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: bold;
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
    font-size: 20px;
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

interface CartProps {
  onCheckout: () => void;
}

export function Cart({ onCheckout }: CartProps) {
  const { t } = useTranslation();
  const { items, subtotal, tax, discount, total, updateQuantity, removeItem, clearCart } = useCartStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <Container>
      <Header>
        <Title>{t('pos.cart')} ({items.length})</Title>
        {items.length > 0 && (
          <ClearButton onClick={() => setShowClearConfirm(true)}>{t('common.clear')}</ClearButton>
        )}
      </Header>

      {items.length === 0 ? (
        <EmptyPlaceholder icon={<ShoppingCart size={48} />} title={t('pos.emptyCart')} />
      ) : (
        <ItemsList>
          {items.map((item) => (
            <CartItem key={item.productId}>
              <ItemRow>
                <ItemName>{item.productName}</ItemName>
                <ItemPrice>{formatCurrency(item.unitPrice * item.quantity)}</ItemPrice>
              </ItemRow>
              <QuantityControls>
                <QuantityButton
                  onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                >
                  -
                </QuantityButton>
                <Quantity>{item.quantity}</Quantity>
                <QuantityButton
                  onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                  disabled={item.quantity >= item.stock}
                >
                  +
                </QuantityButton>
                <RemoveButton onClick={() => removeItem(item.productId)}>
                  <Trash size={16} />
                </RemoveButton>
              </QuantityControls>
            </CartItem>
          ))}
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
          {t('pos.pay')} - {formatCurrency(total)}
        </Button>
      </Footer>

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
