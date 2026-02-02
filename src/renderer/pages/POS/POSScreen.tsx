import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Cart } from './Cart';
import { ProductSearch } from './ProductSearch';
import { Checkout } from './Checkout';
import { useCartStore } from '../../store/cart-store';
import { useProducts } from '../../hooks/useProducts';

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: ${({ theme }) => theme.spacing.md};
  height: calc(100vh - 120px);
`;

const ProductsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BarcodeInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  font-size: 18px;
  border: 2px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}40;
  }
`;

const CartSection = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
`;

export function POSScreen() {
  const { t } = useTranslation();
  const [barcode, setBarcode] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const { addItem } = useCartStore();
  const { searchByBarcode } = useProducts();

  // Focus barcode input on mount and after adding item
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!barcode.trim()) return;

    try {
      const product = await searchByBarcode(barcode.trim());
      if (product) {
        addItem({
          productId: product.id,
          productName: product.nameRu,
          barcode: product.barcode,
          unitPrice: Number(product.price),
          quantity: 1,
          stock: product.stock,
        });
      } else {
        // Product not found - could show error
        console.warn('Product not found:', barcode);
      }
    } catch (error) {
      console.error('Error searching product:', error);
    }

    setBarcode('');
    barcodeInputRef.current?.focus();
  };

  const handleProductSelect = (product: {
    id: string;
    nameRu: string;
    barcode: string;
    price: number;
    stock: number;
  }) => {
    addItem({
      productId: product.id,
      productName: product.nameRu,
      barcode: product.barcode,
      unitPrice: product.price,
      quantity: 1,
      stock: product.stock,
    });
    barcodeInputRef.current?.focus();
  };

  const handleCheckoutComplete = () => {
    setShowCheckout(false);
    barcodeInputRef.current?.focus();
  };

  return (
    <Container>
      <ProductsSection>
        <form onSubmit={handleBarcodeSubmit}>
          <BarcodeInput
            ref={barcodeInputRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder={t('pos.scanBarcode')}
            autoComplete="off"
          />
        </form>

        <ProductSearch onSelect={handleProductSelect} />
      </ProductsSection>

      <CartSection>
        <Cart onCheckout={() => setShowCheckout(true)} />
      </CartSection>

      {showCheckout && (
        <Checkout
          onComplete={handleCheckoutComplete}
          onCancel={() => setShowCheckout(false)}
        />
      )}
    </Container>
  );
}
