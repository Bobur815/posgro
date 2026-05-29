import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';
import { Table } from '@components/common/Table';
import { Pagination } from '@components/common/Pagination';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { SupplierTransactionForm } from './SupplierTransactionForm';
import { SupplierForm } from './SupplierForm';
import { EditArrivalModal } from './EditArrivalModal';
import { useSuppliers } from '../../hooks/useSuppliers';
import { usePagination } from '../../hooks/usePagination';
import { useAuthStore } from '../../store/auth-store';
import { useToast } from '@context/ToastContext';
import {
  SupplierTransaction,
  SupplierTransactionType,
  SupplierTransactionCreateType,
  SupplierPaymentMethod,
  SupplierProduct,
} from '@shared/types';
import { SUPPLIER_PAYMENT_METHOD_I18N_KEYS } from '@shared/constants/payment-methods';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { formatDate } from '../../utils/formatters';
import { ArrowLeft, Edit, Trash } from 'lucide-react';
import { MobileCard, MobileCardList, DesktopOnly } from '../../components/common/MobileCard';

// ── Styled components ──────────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-top: 5px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 768px) {
    font-size: 22px;
  }
`;

const SupplierInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    padding: ${({ theme }) => theme.spacing.md};
    grid-template-columns: 1fr 1fr;
  }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
`;

const InfoValue = styled.span`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 500;
`;

const BalanceCard = styled.div<{ $positive?: boolean }>`
  padding: ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success + '10' : theme.colors.error + '10'};
  border: 1px solid
    ${({ theme, $positive }) =>
      $positive ? theme.colors.success + '40' : theme.colors.error + '40'};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const BalanceLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const BalanceValue = styled.div<{ $positive?: boolean }>`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
`;

const TablesRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  min-width: 0;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
`;

const FilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const FilterLabel = styled.label`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 110px;
`;

const FilterInput = styled.input`
  padding: 8px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const FilterSelect = styled.select`
  padding: 8px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const Badge = styled.span<{ $type: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $type }) => {
    switch ($type) {
      case 'PURCHASE': return theme.colors.error + '20';
      case 'PAYMENT': return theme.colors.success + '20';
      case 'RETURN': return theme.colors.warning + '20';
      case 'ADVANCE': return theme.colors.primary + '20';
      default: return theme.colors.secondary + '20';
    }
  }};
  color: ${({ theme, $type }) => {
    switch ($type) {
      case 'PURCHASE': return theme.colors.error;
      case 'PAYMENT': return theme.colors.success;
      case 'RETURN': return theme.colors.warning;
      case 'ADVANCE': return theme.colors.primary;
      default: return theme.colors.textSecondary;
    }
  }};
`;

const AmountCell = styled.span<{ $negative?: boolean }>`
  font-weight: 500;
  color: ${({ theme, $negative }) =>
    $negative ? theme.colors.error : theme.colors.success};
`;

// ── Component ──────────────────────────────────────────────────────────────────

export function SupplierDetails() {
  const { t, i18n } = useTranslation();
  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as 'ru' | 'uz');
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuthStore();
  const toast = useToast();

  const {
    selectedSupplier,
    isLoading,
    error,
    getById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    clearSelectedSupplier,
  } = useSuppliers();

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] =
    useState<SupplierTransaction | null>(null);
  const [transactionToEdit, setTransactionToEdit] =
    useState<SupplierTransaction | null>(null);
  const [arrivalToEdit, setArrivalToEdit] =
    useState<SupplierTransaction | null>(null);

  // Purchase filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterProductId, setFilterProductId] = useState('');

  useEffect(() => {
    if (id) getById(id);
    return () => clearSelectedSupplier();
  }, [id, getById, clearSelectedSupplier]);

  const handleCreateTransaction = async (data: {
    supplierId: string;
    type: SupplierTransactionCreateType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    referenceId?: string;
    referenceType?: string;
    createdBy: string;
  }) => {
    const result = await createTransaction(data);
    if (result) {
      toast.success(t('suppliers.transactionCreated'));
      setShowTransactionForm(false);
      if (id) await getById(id);
      return true;
    }
    if (error) toast.error(error);
    return false;
  };

  const handleEditTransaction = async (data: {
    supplierId: string;
    type: SupplierTransactionCreateType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    createdBy?: string;
  }) => {
    if (!transactionToEdit) return false;
    const result = await updateTransaction(transactionToEdit.id, {
      type: data.type,
      paymentMethod: data.paymentMethod,
      amount: data.amount,
      description: data.description,
    });
    if (result) {
      toast.success(t('suppliers.transactionUpdated'));
      setTransactionToEdit(null);
      if (id) await getById(id);
      return true;
    }
    if (error) toast.error(error);
    return false;
  };

  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    const success = await deleteTransaction(transactionToDelete.id, id);
    if (success) {
      toast.success(t('suppliers.transactionDeleted'));
      setTransactionToDelete(null);
      if (id) await getById(id);
    }
  };

  const getTransactionTypeLabel = (type: SupplierTransactionType): string => {
    const labels: Partial<Record<SupplierTransactionType, string>> = {
      PAYMENT: t('suppliers.payment'),
      RETURN: t('suppliers.return'),
      ADVANCE: t('suppliers.advance'),
      PURCHASE: t('suppliers.purchase'),
      ADJUSTMENT: t('suppliers.adjustment'),
    };
    return labels[type] ?? type;
  };

  const getPaymentMethodLabel = (method: SupplierPaymentMethod) =>
    t(SUPPLIER_PAYMENT_METHOD_I18N_KEYS[method]);

  const products: SupplierProduct[] =
    (selectedSupplier as any)?.products ?? [];

  // ── filtered splits ──────────────────────────────────────────────────────────

  const allTransactions: SupplierTransaction[] =
    selectedSupplier?.transactions ?? [];

  const filteredPurchase = useMemo(() => {
    let list = allTransactions.filter((tx) => tx.type === 'PURCHASE');

    if (filterStartDate) {
      const from = new Date(filterStartDate);
      from.setHours(0, 0, 0, 0);
      list = list.filter((tx) => new Date(tx.createdAt) >= from);
    }
    if (filterEndDate) {
      const to = new Date(filterEndDate);
      to.setHours(23, 59, 59, 999);
      list = list.filter((tx) => new Date(tx.createdAt) <= to);
    }
    if (filterProductId) {
      const product = products.find(
        (p) => String(p.id) === filterProductId,
      );
      if (product) {
        list = list.filter(
          (tx) =>
            tx.description?.includes(product.nameRu) ||
            tx.description?.includes(product.nameUz),
        );
      }
    }
    return list;
  }, [allTransactions, filterStartDate, filterEndDate, filterProductId, products]);

  const paymentTransactions = useMemo(
    () => allTransactions.filter((tx) => tx.type !== 'PURCHASE'),
    [allTransactions],
  );

  // ── pagination ───────────────────────────────────────────────────────────────

  const purchasePagination = usePagination(filteredPurchase, {
    defaultPageSize: 10,
  });
  const paymentPagination = usePagination(paymentTransactions, {
    defaultPageSize: 10,
  });

  // ── column definitions ───────────────────────────────────────────────────────

  const purchaseColumns = [
    {
      key: 'createdAt',
      header: t('common.createdAt'),
      render: (tx: SupplierTransaction) => formatDate(tx.createdAt),
    },
    {
      key: 'paymentMethod',
      header: t('suppliers.paymentMethod'),
      render: (tx: SupplierTransaction) =>
        getPaymentMethodLabel(tx.paymentMethod),
    },
    {
      key: 'amount',
      header: t('suppliers.amount'),
      render: (tx: SupplierTransaction) => (
        <AmountCell $negative>
          {formatCurrency(Math.abs(tx.amount))}
        </AmountCell>
      ),
    },
    {
      key: 'description',
      header: t('suppliers.description'),
      render: (tx: SupplierTransaction) => tx.description || '-',
    },
    {
      key: 'actions',
      header: '',
      render: (tx: SupplierTransaction) =>
        tx.referenceId ? (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setArrivalToEdit(tx)}
          >
            <Edit size={16} />
          </Button>
        ) : null,
    },
  ];

  const paymentColumns = [
    {
      key: 'createdAt',
      header: t('common.createdAt'),
      render: (tx: SupplierTransaction) => formatDate(tx.createdAt),
    },
    {
      key: 'type',
      header: t('suppliers.transactionType'),
      render: (tx: SupplierTransaction) => (
        <Badge $type={tx.type}>{getTransactionTypeLabel(tx.type)}</Badge>
      ),
    },
    {
      key: 'paymentMethod',
      header: t('suppliers.paymentMethod'),
      render: (tx: SupplierTransaction) =>
        getPaymentMethodLabel(tx.paymentMethod),
    },
    {
      key: 'amount',
      header: t('suppliers.amount'),
      render: (tx: SupplierTransaction) => (
        <AmountCell $negative={tx.amount < 0}>
          {tx.amount < 0 ? '-' : '+'}
          {formatCurrency(Math.abs(tx.amount))}
        </AmountCell>
      ),
    },
    {
      key: 'description',
      header: t('suppliers.description'),
      render: (tx: SupplierTransaction) => tx.description || '-',
    },
    {
      key: 'actions',
      header: '',
      render: (tx: SupplierTransaction) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setTransactionToEdit(tx)}
          >
            <Edit size={16} />
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => setTransactionToDelete(tx)}
          >
            <Trash size={16} />
          </Button>
        </div>
      ),
    },
  ];

  // ── early returns ────────────────────────────────────────────────────────────

  if (isLoading && !selectedSupplier) {
    return <Container>{t('common.loading')}</Container>;
  }
  if (!selectedSupplier) {
    return <Container>{t('suppliers.noSuppliers')}</Container>;
  }

  const supplierName =
    i18n.language === 'uz' ? selectedSupplier.nameUz : selectedSupplier.nameRu;

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate('/suppliers')}
          >
            <ArrowLeft size={20} />
          </Button>
          <Title>{supplierName}</Title>
        </HeaderLeft>
        <Button onClick={() => setShowEditForm(true)}>
          {t('common.edit')}
        </Button>
      </Header>

      <SupplierInfo>
        <InfoItem>
          <InfoLabel>{t('suppliers.phone')}</InfoLabel>
          <InfoValue>{selectedSupplier.phone || '-'}</InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>{t('suppliers.address')}</InfoLabel>
          <InfoValue>{selectedSupplier.address || '-'}</InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>{t('common.createdAt')}</InfoLabel>
          <InfoValue>{formatDate(selectedSupplier.createdAt)}</InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>{t('suppliers.status') || 'Status'}</InfoLabel>
          <InfoValue
            style={{ color: selectedSupplier.active ? undefined : '#ef4444' }}
          >
            {selectedSupplier.active
              ? t('suppliers.active')
              : t('suppliers.inactive')}
          </InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>{t('suppliers.paymentType')}</InfoLabel>
          <InfoValue>
            {selectedSupplier.paymentType === 'INSTALLMENT'
              ? t('suppliers.paymentTypeInstallment')
              : t('suppliers.paymentTypeImmediate')}
          </InfoValue>
        </InfoItem>
        <BalanceCard $positive={selectedSupplier.balance >= 0}>
          <BalanceLabel>
            {selectedSupplier.balance < 0
              ? t('suppliers.weOwe')
              : t('suppliers.theyOwe')}
          </BalanceLabel>
          <BalanceValue $positive={selectedSupplier.balance >= 0}>
            {formatCurrency(Math.abs(selectedSupplier.balance))}
          </BalanceValue>
        </BalanceCard>
      </SupplierInfo>

      <TablesRow>
        {/* ── PURCHASE (arrivals) ──────────────────────────────────────────── */}
        <Section>
          <SectionHeader>
            <SectionTitle>{t('suppliers.purchase')}</SectionTitle>
          </SectionHeader>

          {/* Filters */}
          <FilterBar>
            <FilterLabel>
              {t('reports.startDate')}
              <FilterInput
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </FilterLabel>
            <FilterLabel>
              {t('reports.endDate')}
              <FilterInput
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </FilterLabel>
            {products.length > 0 && (
              <FilterLabel>
                {t('products.product')}
                <FilterSelect
                  value={filterProductId}
                  onChange={(e) => setFilterProductId(e.target.value)}
                >
                  <option value="">{t('filters.all')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {i18n.language === 'uz' ? p.nameUz : p.nameRu}
                    </option>
                  ))}
                </FilterSelect>
              </FilterLabel>
            )}
          </FilterBar>

          {/* Mobile */}
          <MobileCardList>
            {purchasePagination.pageData.map((tx) => (
              <MobileCard
                key={tx.id}
                title={formatCurrency(Math.abs(tx.amount))}
                subtitle={formatDate(tx.createdAt)}
                fields={[
                  {
                    label: t('suppliers.paymentMethod'),
                    value: getPaymentMethodLabel(tx.paymentMethod),
                  },
                  {
                    label: t('suppliers.description'),
                    value: tx.description || '-',
                  },
                ]}
                actions={
                  tx.referenceId ? (
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setArrivalToEdit(tx)}
                    >
                      <Edit size={16} />
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </MobileCardList>

          {/* Desktop */}
          <DesktopOnly>
            <TableWrapper>
              <Table
                columns={purchaseColumns}
                data={purchasePagination.pageData}
                loading={isLoading}
                emptyMessage={t('suppliers.noTransactions')}
              />
              <Pagination
                currentPage={purchasePagination.currentPage}
                totalPages={purchasePagination.totalPages}
                totalItems={purchasePagination.totalItems}
                pageSize={purchasePagination.pageSize}
                pageSizeOptions={purchasePagination.pageSizeOptions}
                onPageChange={purchasePagination.goToPage}
                onPageSizeChange={purchasePagination.setPageSize}
              />
            </TableWrapper>
          </DesktopOnly>
        </Section>

        {/* ── PAYMENTS / RETURNS / ADVANCES ────────────────────────────────── */}
        <Section>
          <SectionHeader>
            <SectionTitle>{t('suppliers.transactionHistory')}</SectionTitle>
            <Button onClick={() => setShowTransactionForm(true)}>
              {t('suppliers.addTransaction')}
            </Button>
          </SectionHeader>

          {/* Mobile */}
          <MobileCardList>
            {paymentPagination.pageData.map((tx) => (
              <MobileCard
                key={tx.id}
                title={getTransactionTypeLabel(tx.type)}
                subtitle={formatDate(tx.createdAt)}
                fields={[
                  {
                    label: t('suppliers.paymentMethod'),
                    value: getPaymentMethodLabel(tx.paymentMethod),
                  },
                  {
                    label: t('suppliers.amount'),
                    value: (
                      <AmountCell $negative={tx.amount < 0}>
                        {tx.amount < 0 ? '-' : '+'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </AmountCell>
                    ),
                  },
                  {
                    label: t('suppliers.description'),
                    value: tx.description || '-',
                  },
                ]}
                actions={
                  <>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setTransactionToEdit(tx)}
                    >
                      <Edit size={16} />
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      onClick={() => setTransactionToDelete(tx)}
                    >
                      <Trash size={16} />
                    </Button>
                  </>
                }
              />
            ))}
          </MobileCardList>

          {/* Desktop */}
          <DesktopOnly>
            <TableWrapper>
              <Table
                columns={paymentColumns}
                data={paymentPagination.pageData}
                loading={isLoading}
                emptyMessage={t('suppliers.noTransactions')}
              />
              <Pagination
                currentPage={paymentPagination.currentPage}
                totalPages={paymentPagination.totalPages}
                totalItems={paymentPagination.totalItems}
                pageSize={paymentPagination.pageSize}
                pageSizeOptions={paymentPagination.pageSizeOptions}
                onPageChange={paymentPagination.goToPage}
                onPageSizeChange={paymentPagination.setPageSize}
              />
            </TableWrapper>
          </DesktopOnly>
        </Section>
      </TablesRow>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showTransactionForm && id && (
        <SupplierTransactionForm
          supplierId={id}
          supplierProducts={products}
          onSubmit={handleCreateTransaction}
          onCancel={() => setShowTransactionForm(false)}
          currentUserId={user?.id || ''}
        />
      )}

      {transactionToEdit && id && (
        <SupplierTransactionForm
          supplierId={id}
          transaction={transactionToEdit}
          supplierProducts={products}
          onSubmit={handleEditTransaction}
          onCancel={() => setTransactionToEdit(null)}
          currentUserId={user?.id || ''}
        />
      )}

      {arrivalToEdit && (
        <EditArrivalModal
          transaction={arrivalToEdit}
          onClose={() => setArrivalToEdit(null)}
          onSuccess={async () => {
            setArrivalToEdit(null);
            toast.success(t('inventory.arrivalCreated'));
            if (id) await getById(id);
          }}
        />
      )}

      {showEditForm && id && (
        <SupplierForm
          supplierId={id}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            getById(id);
          }}
        />
      )}

      {transactionToDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('suppliers.confirmDeleteTransaction')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleDeleteTransaction}
          onCancel={() => setTransactionToDelete(null)}
        />
      )}
    </Container>
  );
}
