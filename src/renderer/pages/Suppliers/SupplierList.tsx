import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Table } from '../../components/common/Table';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useToast } from '../../context/ToastContext';
import { Supplier } from '@shared/types';
import { formatCurrency as formatCurrencyBase } from '../../utils/formatters';

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

const HeaderActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
`;

const Badge = styled.span<{ $active?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.success : theme.colors.error};
  color: white;
`;

const BalanceBadge = styled.span<{ $positive?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success + '20' : theme.colors.error + '20'};
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  cursor: pointer;
`;

export function SupplierList() {
  const { t, i18n } = useTranslation();
  const formatCurrency = (amount: number) => formatCurrencyBase(amount, i18n.language as 'ru' | 'uz');
  const navigate = useNavigate();
  const toast = useToast();
  const { suppliers, isLoading, loadSuppliers, deleteSupplier, error } = useSuppliers();
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    loadSuppliers(showInactive);
  }, [showInactive, loadSuppliers]);

  const handleDelete = async (supplier: Supplier) => {
    const success = await deleteSupplier(supplier.id);
    if (success) {
      toast.success(t('suppliers.supplierDeleted'));
      setSupplierToDelete(null);
    } else if (error) {
      toast.error(error);
    }
  };

  const columns = [
    { key: '#', header: '#', render: (_: Supplier, index: number) => index + 1 },
    {
      key: 'name',
      header: t('suppliers.supplier'),
      render: (supplier: Supplier) =>
        i18n.language === 'uz' ? supplier.nameUz : supplier.nameRu,
    },
    {
      key: 'phone',
      header: t('suppliers.phone'),
      render: (supplier: Supplier) => supplier.phone || '-',
    },
    {
      key: 'balance',
      header: t('suppliers.balance'),
      render: (supplier: Supplier) => (
        <BalanceBadge $positive={supplier.balance >= 0}>
          {supplier.balance < 0
            ? `${t('suppliers.weOwe')}: ${formatCurrency(Math.abs(supplier.balance))}`
            : supplier.balance > 0
            ? `${t('suppliers.theyOwe')}: ${formatCurrency(supplier.balance)}`
            : formatCurrency(0)}
        </BalanceBadge>
      ),
    },
    {
      key: 'active',
      header: t('users.status'),
      render: (supplier: Supplier) => (
        <Badge $active={supplier.active}>
          {supplier.active ? t('suppliers.active') : t('suppliers.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (supplier: Supplier) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="small"
            variant="secondary"
            onClick={() => navigate(`/suppliers/${supplier.id}`)}
          >
            {t('suppliers.viewDetails')}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => setSupplierToDelete(supplier)}
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title>{t('suppliers.title')}</Title>
        <HeaderActions>
          <CheckboxLabel>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t('suppliers.showInactive')}
          </CheckboxLabel>
          <Button onClick={() => navigate('/suppliers/new')}>
            {t('suppliers.addSupplier')}
          </Button>
        </HeaderActions>
      </Header>

      <Table
        columns={columns}
        data={suppliers}
        loading={isLoading}
        emptyMessage={t('suppliers.noSuppliers')}
      />

      {supplierToDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('suppliers.confirmDelete')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={() => handleDelete(supplierToDelete)}
          onCancel={() => setSupplierToDelete(null)}
        />
      )}
    </Container>
  );
}
