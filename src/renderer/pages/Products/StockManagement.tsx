import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useProducts } from '../../hooks/useProducts';
import { useAuthStore } from '../../store/auth-store';
import { Table } from '../../components/common/Table';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ProductFilters } from '../../components/products/ProductFilters';
import { ProductFilterParams, Supplier, SupplierPaymentMethod } from '@shared/types';

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

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const PAYMENT_METHODS: SupplierPaymentMethod[] = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'INSTALLMENT',
  'ONE_TO_ONE',
];

interface StockProduct {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  stock: number;
  minStock: number;
  unit: string;
}

export function StockManagement() {
  const { t, i18n } = useTranslation();
  const { products, categories, suppliers, loadProducts, loadCategories, loadSuppliers, getLowStock, isLoading } = useProducts();
  const { user } = useAuthStore();

  const [showArrival, setShowArrival] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [filters, setFilters] = useState<ProductFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [arrivalData, setArrivalData] = useState({
    quantity: '',
    cost: '',
    notes: '',
    supplierId: '',
    paymentMethod: 'INSTALLMENT' as SupplierPaymentMethod,
  });

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadSuppliers();
  }, [loadProducts, loadCategories, loadSuppliers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(filters);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, loadProducts]);

  const handleAddArrival = (product: StockProduct) => {
    setSelectedProduct(product);
    setArrivalData({ quantity: '', cost: '', notes: '', supplierId: '', paymentMethod: 'INSTALLMENT' });
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
        supplierId: arrivalData.supplierId || undefined,
        paymentMethod: arrivalData.supplierId ? arrivalData.paymentMethod : undefined,
        createdBy: user?.id,
      });

      setShowArrival(false);
      loadProducts();
    } catch (error) {
      console.error('Failed to create arrival:', error);
    }
  };

  const getPaymentMethodLabel = (method: SupplierPaymentMethod) => {
    const labels: Record<SupplierPaymentMethod, string> = {
      CASH: t('suppliers.cash'),
      CARD: t('suppliers.card'),
      BANK_TRANSFER: t('suppliers.bankTransfer'),
      INSTALLMENT: t('suppliers.installment'),
      ONE_TO_ONE: t('suppliers.oneToOne'),
    };
    return labels[method];
  };

  const columns = [
    { key: 'barcode', header: t('products.barcode') },
    {
      key: 'name',
      header: t('products.name'),
      render: (product: StockProduct) =>
        i18n.language === 'uz' ? product.nameUz : product.nameRu,
    },
    {
      key: 'stock',
      header: t('products.stock'),
      render: (product: StockProduct) => (
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
      render: (product: StockProduct) => `${product.minStock} ${product.unit}`,
    },
    {
      key: 'actions',
      header: '',
      render: (product: StockProduct) => (
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
        <Button onClick={() => setIsFilterOpen(!isFilterOpen)}>
          {t('filters.filters')}
        </Button>
      </Header>

      <ProductFilters
        filters={filters}
        onChange={setFilters}
        categories={categories as any}
        suppliers={suppliers}
        isOpen={isFilterOpen}
      />

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

            <FormGroup>
              <Label>{t('products.supplier')}</Label>
              <Select
                value={arrivalData.supplierId}
                onChange={(e) =>
                  setArrivalData((prev) => ({ ...prev, supplierId: e.target.value }))
                }
              >
                <option value="">{t('products.noSupplier')}</option>
                {suppliers.map((supplier: Supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {i18n.language === 'uz' ? supplier.nameUz : supplier.nameRu}
                  </option>
                ))}
              </Select>
            </FormGroup>

            {arrivalData.supplierId && (
              <FormGroup>
                <Label>{t('suppliers.paymentMethod')}</Label>
                <Select
                  value={arrivalData.paymentMethod}
                  onChange={(e) =>
                    setArrivalData((prev) => ({
                      ...prev,
                      paymentMethod: e.target.value as SupplierPaymentMethod,
                    }))
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {getPaymentMethodLabel(method)}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            )}

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
