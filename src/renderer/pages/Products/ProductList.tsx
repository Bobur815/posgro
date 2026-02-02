import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useProducts } from '../../hooks/useProducts';
import { useAuthStore } from '../../store/auth-store';
import { Table } from '../../components/common/Table';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Filters = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SearchInput = styled(Input)`
  max-width: 300px;
`;

export function ProductList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { products, loadProducts, search, isLoading } = useProducts();
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        search(searchQuery);
      } else {
        loadProducts();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, search, loadProducts]);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  const columns = [
    { key: 'barcode', header: t('products.barcode') },
    {
      key: 'name',
      header: t('products.name'),
      render: (product: { nameRu: string; nameUz: string }) =>
        i18n.language === 'uz' ? product.nameUz : product.nameRu,
    },
    {
      key: 'price',
      header: t('products.price'),
      render: (product: { price: number }) => formatCurrency(product.price),
    },
    {
      key: 'stock',
      header: t('products.stock'),
      render: (product: { stock: number; minStock: number }) => (
        <span style={{ color: product.stock <= product.minStock ? '#f44336' : 'inherit' }}>
          {product.stock} {product.unit}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('products.category'),
      render: (product: { category?: { nameRu: string; nameUz: string } }) =>
        product.category
          ? i18n.language === 'uz'
            ? product.category.nameUz
            : product.category.nameRu
          : '-',
    },
  ];

  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: '',
      render: (product: { id: string }) => (
        <Button
          variant="secondary"
          size="small"
          onClick={() => navigate(`/products/${product.id}/edit`)}
        >
          {t('common.edit')}
        </Button>
      ),
    });
  }

  return (
    <Container>
      <Header>
        <Title>{t('products.title')}</Title>
        {isAdmin && (
          <Button onClick={() => navigate('/products/new')}>
            {t('products.addProduct')}
          </Button>
        )}
      </Header>

      <Filters>
        <SearchInput
          type="text"
          placeholder={t('common.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Filters>

      <Table
        columns={columns}
        data={products}
        loading={isLoading}
        emptyMessage={t('products.noProducts')}
      />
    </Container>
  );
}
