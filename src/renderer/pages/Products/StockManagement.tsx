import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useProducts } from '../../hooks/useProducts';
import { Table } from '../../components/common/Table';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';

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

const LowStockBadge = styled.span`
  background-color: ${({ theme }) => theme.colors.warning};
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

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

interface Product {
  id: string;
  nameRu: string;
  nameUz: string;
  barcode: string;
  stock: number;
  minStock: number;
  unit: string;
}

export function StockManagement() {
  const { t, i18n } = useTranslation();
  const { products, loadProducts, getLowStock, isLoading } = useProducts();

  const [showArrival, setShowArrival] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [arrivalData, setArrivalData] = useState({
    quantity: '',
    cost: '',
    notes: '',
  });

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddArrival = (product: Product) => {
    setSelectedProduct(product);
    setArrivalData({ quantity: '', cost: '', notes: '' });
    setShowArrival(true);
  };

  const handleSubmitArrival = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct) return;

    try {
      await window.electronAPI.inventory.createArrival({
        productId: selectedProduct.id,
        quantity: parseFloat(arrivalData.quantity),
        cost: parseFloat(arrivalData.cost),
        notes: arrivalData.notes,
      });

      setShowArrival(false);
      loadProducts();
    } catch (error) {
      console.error('Failed to create arrival:', error);
    }
  };

  const columns = [
    { key: 'barcode', header: t('products.barcode') },
    {
      key: 'name',
      header: t('products.name'),
      render: (product: Product) =>
        i18n.language === 'uz' ? product.nameUz : product.nameRu,
    },
    {
      key: 'stock',
      header: t('products.stock'),
      render: (product: Product) => (
        <span style={{ color: product.stock <= product.minStock ? '#f44336' : 'inherit' }}>
          {product.stock} {product.unit}
          {product.stock <= product.minStock && (
            <LowStockBadge>{t('products.lowStock')}</LowStockBadge>
          )}
        </span>
      ),
    },
    {
      key: 'minStock',
      header: t('products.minStock'),
      render: (product: Product) => `${product.minStock} ${product.unit}`,
    },
    {
      key: 'actions',
      header: '',
      render: (product: Product) => (
        <Button size="small" onClick={() => handleAddArrival(product)}>
          {t('inventory.addArrival')}
        </Button>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title>
          {t('inventory.stockManagement')}
          {products.filter((p) => p.stock <= p.minStock).length > 0 && (
            <LowStockBadge>
              {products.filter((p) => p.stock <= p.minStock).length} {t('inventory.lowStockItems')}
            </LowStockBadge>
          )}
        </Title>
      </Header>

      <Table
        columns={columns}
        data={products}
        loading={isLoading}
        emptyMessage={t('products.noProducts')}
      />

      {showArrival && selectedProduct && (
        <Modal
          title={t('inventory.newArrival')}
          onClose={() => setShowArrival(false)}
        >
          <Form onSubmit={handleSubmitArrival}>
            <div>
              <strong>{t('products.product')}:</strong>{' '}
              {i18n.language === 'uz' ? selectedProduct.nameUz : selectedProduct.nameRu}
            </div>
            <div>
              <strong>{t('products.currentStock')}:</strong> {selectedProduct.stock}{' '}
              {selectedProduct.unit}
            </div>

            <Input
              label={t('inventory.quantity')}
              type="number"
              value={arrivalData.quantity}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, quantity: e.target.value }))
              }
              required
            />

            <Input
              label={t('inventory.costPerUnit')}
              type="number"
              value={arrivalData.cost}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, cost: e.target.value }))
              }
              required
            />

            <Input
              label={t('inventory.notes')}
              value={arrivalData.notes}
              onChange={(e) =>
                setArrivalData((prev) => ({ ...prev, notes: e.target.value }))
              }
            />

            <Actions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowArrival(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </Actions>
          </Form>
        </Modal>
      )}
    </Container>
  );
}
