import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCartStore } from '../../store/cart-store';
import { Button } from '../../components/common/Button';

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

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TotalLabel = styled.span`
  font-size: 18px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
`;

const TotalAmount = styled.span`
  font-size: 24px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
`;

const EmptyCart = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface CartProps {
  onCheckout: () => void;
}

export function Cart({ onCheckout }: CartProps) {
  const { t } = useTranslation();
  const { items, total, updateQuantity, removeItem, clearCart } = useCartStore();

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  return (
    <Container>
      <Header>
        <Title>{t('pos.cart')} ({items.length})</Title>
        {items.length > 0 && (
          <ClearButton onClick={clearCart}>{t('common.clear')}</ClearButton>
        )}
      </Header>

      {items.length === 0 ? (
        <EmptyCart>{t('pos.emptyCart')}</EmptyCart>
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
                  {t('common.remove')}
                </RemoveButton>
              </QuantityControls>
            </CartItem>
          ))}
        </ItemsList>
      )}

      <Footer>
        <TotalRow>
          <TotalLabel>{t('pos.total')}:</TotalLabel>
          <TotalAmount>{formatCurrency(total)}</TotalAmount>
        </TotalRow>
        <Button
          fullWidth
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          {t('pos.pay')}
        </Button>
      </Footer>
    </Container>
  );
}
