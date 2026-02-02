import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useProducts } from '../../hooks/useProducts';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SearchContainer = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ProductsGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const ProductCard = styled.button<{ $lowStock?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: ${({ theme }) => theme.shadows.sm};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ $lowStock, theme }) =>
    $lowStock &&
    `
    border-color: ${theme.colors.warning};
  `}
`;

const ProductName = styled.span`
  font-weight: 500;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ProductPrice = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: bold;
  font-size: 16px;
`;

const ProductStock = styled.span<{ $low?: boolean }>`
  font-size: 12px;
  color: ${({ theme, $low }) => ($low ? theme.colors.warning : theme.colors.textSecondary)};
`;

const NoResults = styled.div`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};
`;

interface Product {
  id: string;
  nameRu: string;
  nameUz: string;
  barcode: string;
  price: number;
  stock: number;
  minStock: number;
}

interface ProductSearchProps {
  onSelect: (product: Product) => void;
}

export function ProductSearch({ onSelect }: ProductSearchProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const { products, search, isLoading } = useProducts();

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim()) {
        search(searchQuery);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, search]);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  const getProductName = (product: Product) => {
    return i18n.language === 'uz' ? product.nameUz : product.nameRu;
  };

  const displayProducts = searchQuery.trim() ? products : [];

  return (
    <Container>
      <SearchContainer>
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('common.search')}
        />
      </SearchContainer>

      <ProductsGrid>
        {isLoading ? (
          <NoResults>{t('common.loading')}</NoResults>
        ) : displayProducts.length === 0 ? (
          searchQuery.trim() ? (
            <NoResults>{t('products.noResults')}</NoResults>
          ) : (
            <NoResults>{t('pos.searchProducts')}</NoResults>
          )
        ) : (
          displayProducts.map((product) => (
            <ProductCard
              key={product.id}
              onClick={() => onSelect(product)}
              disabled={product.stock <= 0}
              $lowStock={product.stock <= product.minStock}
            >
              <ProductName>{getProductName(product)}</ProductName>
              <ProductPrice>{formatCurrency(product.price)}</ProductPrice>
              <ProductStock $low={product.stock <= product.minStock}>
                {t('products.stock')}: {product.stock}
              </ProductStock>
            </ProductCard>
          ))
        )}
      </ProductsGrid>
    </Container>
  );
}
