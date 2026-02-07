import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Cart } from './Cart';
import { ProductSearch } from './ProductSearch';
import { Checkout } from './Checkout';
import { useCartStore } from '../../store/cart-store';
import { useProducts } from '../../hooks/useProducts';
import { Delete, SendHorizontal, Trash } from 'lucide-react';

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 520px;
  gap: ${({ theme }) => theme.spacing.md};
  height: calc(100vh - 120px);
`;

const LeftSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InputSection = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InputPanel = styled.div`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.md};
`;

const InputLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  text-transform: uppercase;
`;

const InputDisplay = styled.div<{ $active?: boolean }>`
  font-size: 24px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  border: 2px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  min-height: 48px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: border-color 0.2s;
`;

const NumberPadSection = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.md};
`;

const NumberPad = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`;

const NumButton = styled.button<{ $variant?: 'action' | 'clear' | 'enter' }>`
  height: 60px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 24px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}15;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:active {
    transform: scale(0.95);
    background-color: ${({ theme }) => theme.colors.primary}30;
  }

  ${({ $variant, theme }) =>
    $variant === 'action' &&
    `
    background-color: ${theme.colors.primary}10;
    border-color: ${theme.colors.primary}50;
    color: ${theme.colors.primary};
    font-size: 14px;
    &:hover {
      background-color: ${theme.colors.primary}20;
    }
  `}

  ${({ $variant, theme }) =>
    $variant === 'clear' &&
    `
    background-color: ${theme.colors.error}10;
    border-color: ${theme.colors.error}50;
    color: ${theme.colors.error};
    font-size: 14px;
    &:hover {
      background-color: ${theme.colors.error}20;
    }
  `}

  ${({ $variant, theme }) =>
    $variant === 'enter' &&
    `
    background-color: ${theme.colors.success};
    border-color: ${theme.colors.success};
    color: white;
    font-size: 16px;
    &:hover {
      opacity: 0.9;
    }
  `}
`;

const ProductsSection = styled.div`
  flex: 1;
  overflow: hidden;
`;

const CartSection = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error}15;
  color: ${({ theme }) => theme.colors.error};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  text-align: center;
`;

interface Product {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  price: number;
  stock: number;
  minStock: number;
}

type InputMode = 'barcode' | 'quantity' | 'id';

export function POSScreen() {
  const { t, i18n } = useTranslation();
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [id, setId] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('barcode');
  const [showCheckout, setShowCheckout] = useState(false);
  const [error, setError] = useState('');

  const { addItem } = useCartStore();
  const { searchByBarcode } = useProducts();

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if checkout modal is open
      if (showCheckout) return;

      // Number keys
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (inputMode === 'barcode') {
          setBarcode(prev => prev + e.key);
        } else if (inputMode === 'id') {
          setId(prev => prev + e.key);
        } else {
          setQuantity(prev => (prev === '0' ? e.key : prev + e.key));
        }
        setError('');
      }
      // Backspace
      else if (e.key === 'Backspace') {
        e.preventDefault();
        if (inputMode === 'barcode') {
          setBarcode(prev => prev.slice(0, -1));
        } else {
          setQuantity(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        }
      }
      // Enter - submit barcode
      else if (e.key === 'Enter') {
        e.preventDefault();
        handleBarcodeSubmit();
      }
      // Tab - switch input mode
      else if (e.key === 'Tab') {
        e.preventDefault();
        setInputMode(prev => prev === 'barcode' ? 'quantity' : 'barcode');
      }
      // Escape - clear
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
      // . - add decimal point in quantity mode
      else if (e.key === '.' && inputMode === 'quantity') {
        e.preventDefault();
        if (!quantity.includes('.')) {
          setQuantity(prev => prev + '.');
        }
      }
      // * - switch to quantity
      else if (e.key === '*') {
        e.preventDefault();
        setInputMode('quantity');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputMode, barcode, quantity, showCheckout]);

  const handleBarcodeSubmit = useCallback(async () => {
    if (!barcode.trim() && !id.trim()) {
      setError(t('pos.enterBarcode'));
      return;
    }
    const searchCode = barcode.trim() || id.trim();

    try {
      const product = await searchByBarcode(searchCode) as Product | null;
      if (product) {
        const qty = parseInt(quantity) || 1;
        const productName = i18n.language === 'uz' ? product.nameUz : product.nameRu;

        addItem({
          productId: product.id,
          productName,
          barcode: product.barcode,
          unitPrice: Number(product.price),
          quantity: qty,
          stock: product.stock,
        });

        // Reset inputs
        setBarcode('');
        setQuantity('1');
        setInputMode('barcode');
        setError('');
      } else {
        setError(t('products.noResults'));
      }
    } catch (err) {
      console.error('Error searching product:', err);
      setError(t('common.error'));
    }
  }, [barcode, quantity, searchByBarcode, addItem, t, i18n.language]);

  const handleNumberClick = (num: string) => {
    if (inputMode === 'barcode') {
      setBarcode(prev => prev + num);
    } else {
      setQuantity(prev => (prev === '0' ? num : prev + num));
    }
    setError('');
  };

  const handleBackspace = () => {
    if (inputMode === 'barcode') {
      setBarcode(prev => prev.slice(0, -1));
    } else {
      setQuantity(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    }
  };

  const handleClear = () => {
    if (inputMode === 'barcode') {
      setBarcode('');
    } else {
      setQuantity('1');
    }
    setError('');
  };

  const handleProductSelect = (product: Product) => {
    const qty = parseInt(quantity) || 1;
    const productName = i18n.language === 'uz' ? product.nameUz : product.nameRu;

    addItem({
      productId: product.id,
      productName,
      barcode: product.barcode,
      unitPrice: product.price,
      quantity: qty,
      stock: product.stock,
    });

    setQuantity('1');
    setError('');
  };

  const handleCheckoutComplete = () => {
    setShowCheckout(false);
  };

  return (
    <Container>
      <LeftSection>
        <InputSection>
          <InputPanel>
            <InputLabel>{t('pos.barcode')}</InputLabel>
            <InputDisplay
              $active={inputMode === 'barcode'}
              onClick={() => setInputMode('barcode')}
            >
              {barcode || '—'}
            </InputDisplay>
          </InputPanel>

          <InputPanel>
            <InputLabel>{t('pos.id')}</InputLabel>
            <InputDisplay
              $active={inputMode === 'id'}
              onClick={() => setInputMode('id')}
            >
              {id || '—'}
            </InputDisplay>
          </InputPanel>

          <InputPanel>
            <InputLabel>{t('pos.quantity')}</InputLabel>
            <InputDisplay
              $active={inputMode === 'quantity'}
              onClick={() => setInputMode('quantity')}
            >
              {quantity}
            </InputDisplay>
          </InputPanel>
        </InputSection>

        <NumberPadSection>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <NumberPad>
            {['7', '8', '9'].map(num => (
              <NumButton key={num} onClick={() => handleNumberClick(num)}>{num}</NumButton>
            ))}
            <NumButton $variant="clear" onClick={handleClear}><Trash size={30} /></NumButton>

            {['4', '5', '6'].map(num => (
              <NumButton key={num} onClick={() => handleNumberClick(num)}>{num}</NumButton>
            ))}
            <NumButton $variant="action" onClick={handleBackspace}><Delete size={30} /></NumButton>

            {['1', '2', '3'].map(num => (
              <NumButton key={num} onClick={() => handleNumberClick(num)}>{num}</NumButton>
            ))}
            <NumButton
              $variant="action"
              onClick={() => setInputMode(inputMode === 'barcode' ? 'quantity' : 'barcode')}
            >
              {inputMode === 'barcode' ? 'QTY' : 'BAR'}
            </NumButton>

            <NumButton onClick={() => handleNumberClick('00')}>00</NumButton>
            <NumButton onClick={() => handleNumberClick('0')}>0</NumButton>
            <NumButton onClick={() => handleNumberClick('.')}>.</NumButton>
            <NumButton $variant="enter" onClick={handleBarcodeSubmit}><SendHorizontal size={30} /></NumButton>
          </NumberPad>
        </NumberPadSection>

        <ProductsSection>
          <ProductSearch onSelect={handleProductSelect} />
        </ProductsSection>
      </LeftSection>

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
