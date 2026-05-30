import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../components/common/Button';
import { Table } from '../../components/common/Table';
import { Pagination } from '../../components/common/Pagination';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SupplierTransactionForm } from './SupplierTransactionForm';
import { SupplierManagementModal } from './SupplierManagementModal';
import { useSuppliers } from '../../hooks/useSuppliers';
import { usePagination } from '../../hooks/usePagination';
import { useAuthStore } from '../../store/auth-store';
import { useToast } from '../../context/ToastContext';
import {
  SupplierTransaction,
  SupplierTransactionType,
  SupplierPaymentMethod,
  SupplierProduct,
  InventoryArrivalDescription,
} from '@shared/types';
import { SUPPLIER_PAYMENT_METHOD_I18N_KEYS } from '@shared/constants/payment-methods';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { ArrowLeft, Edit, Trash, ChevronDown, ChevronUp, Plus } from 'lucide-react';

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
  padding-left: 25px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const BackButton = styled(Button)`
  margin-right: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const SupplierInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
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
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  min-width: 0;
`;

const Divider = styled.hr`
  border: none;
  border-top: 2px solid ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.md} 0;
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
`;

const CollapseHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const CollapseBody = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const DescriptionGrid = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 8px;
  font-size: 13px;
`;

const DescCell = styled.span<{ $label?: boolean }>`
  color: ${({ theme, $label }) => $label ? theme.colors.textSecondary : theme.colors.text};
  font-weight: ${({ $label }) => $label ? 400 : 500};
  white-space: nowrap;
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
  padding: 8px;
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
  padding: 8px;
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

const TotalTd = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  background-color: ${({ theme }) => theme.colors.background};
  border-top: 2px solid ${({ theme }) => theme.colors.border};
`;

const MobileTotalBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;

  @media (min-width: 769px) {
    display: none;
  }
`;

const MobileTotalItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
`;

const MobileTotalLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
`;

const MobileTotalValue = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseArrivalDescription(d: InventoryArrivalDescription | undefined): InventoryArrivalDescription | null {
  return d?.productId != null ? d : null;
}

function getDescriptionText(d: InventoryArrivalDescription | undefined): string {
  if (!d) return '-';
  if (d.productId != null) return `${d.arrivalWord}: ${d.productName} x${d.quantity}`;
  return '-';
}

function formatArrivalDescription(d: InventoryArrivalDescription | undefined): string {
  return getDescriptionText(d);
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SupplierDetails() {
  const { t, i18n } = useTranslation();
  const formatCurrency = (amount: number) => formatCurrencyBase(amount, i18n.language as 'ru' | 'uz');
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
  const [transactionToDelete, setTransactionToDelete] =
    useState<SupplierTransaction | null>(null);
  const [transactionToEdit, setTransactionToEdit] =
    useState<SupplierTransaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Collapsible sections
  const [purchaseOpen, setPurchaseOpen] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(true);

  // Purchase filters — default to today
  const today = new Date().toISOString().split('T')[0];
  const [filterStartDate, setFilterStartDate] = useState(today);
  const [filterEndDate, setFilterEndDate] = useState(today);
  const [filterProductId, setFilterProductId] = useState('');

  useEffect(() => {
    if (id) {
      getById(id);
    }
    return () => clearSelectedSupplier();
  }, [id, getById, clearSelectedSupplier]);

  const handleCreateTransaction = async (data: {
    supplierId: string;
    type: SupplierTransactionType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    dueDate?: string;
    createdBy: string;
  }) => {
    const result = await createTransaction(data as any);
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
    type: SupplierTransactionType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    dueDate?: string;
    createdBy: string;
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
      PURCHASE: t('suppliers.purchase'),
      PAYMENT: t('suppliers.payment'),
      RETURN: t('suppliers.return'),
      ADVANCE: t('suppliers.advance'),
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
      const targetId = Number(filterProductId);
      list = list.filter((tx) => tx.description?.productId === targetId);
    }
    return list;
  }, [allTransactions, filterStartDate, filterEndDate, filterProductId]);

  const paymentTransactions = useMemo(
    () => allTransactions.filter((tx) => tx.type !== 'PURCHASE'),
    [allTransactions],
  );

  // ── totals ───────────────────────────────────────────────────────────────────

  const purchaseTotals = useMemo(() => ({
    amount: filteredPurchase.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    quantity: filteredPurchase.reduce((sum, tx) => sum + (tx.description?.quantity ?? 0), 0),
  }), [filteredPurchase]);

  const paymentTotals = useMemo(() => ({
    amount: paymentTransactions.reduce((sum, tx) => sum + tx.amount, 0),
  }), [paymentTransactions]);

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
      render: (tx: SupplierTransaction) => formatDateTime(tx.createdAt),
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
      render: (tx: SupplierTransaction) => {
        const d = parseArrivalDescription(tx.description);
        if (!d) return <span>{formatArrivalDescription(tx.description)}</span>;
        return (
          <DescriptionGrid>
            <DescCell $label>{d.arrivalWord}</DescCell>
            <DescCell>{d.productName}</DescCell>
            <DescCell $label>{t('inventory.quantity')}</DescCell>
            <DescCell>{d.quantity}</DescCell>
            <DescCell $label>{t('inventory.costPerUnit')}</DescCell>
            <DescCell>{formatCurrency(d.cost)}</DescCell>
          </DescriptionGrid>
        );
      },
    },
  ];

  const paymentColumns = [
    {
      key: 'createdAt',
      header: t('common.createdAt'),
      render: (tx: SupplierTransaction) => formatDateTime(tx.createdAt),
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
      render: (tx: SupplierTransaction) => getDescriptionText(tx.description),
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
          <BackButton
            variant="secondary"
            size="small"
            onClick={() => navigate('/suppliers')}
          >
            <ArrowLeft size={20} />
          </BackButton>
          <Title>{supplierName}</Title>
        </HeaderLeft>
        <Button onClick={() => setShowEditModal(true)}>
          <Edit size={18} /> {t('common.edit')}
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
          <InfoValue>
            {formatDate(selectedSupplier.createdAt)}
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
          <CollapseHeader onClick={() => setPurchaseOpen((v) => !v)}>
            <SectionTitle>{t('suppliers.purchase')}</SectionTitle>
            {purchaseOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </CollapseHeader>

          <CollapseBody $open={purchaseOpen}>
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

            <MobileTotalBar>
              <MobileTotalItem>
                <MobileTotalLabel>{t('pos.total')}</MobileTotalLabel>
                <MobileTotalValue>{formatCurrency(purchaseTotals.amount)}</MobileTotalValue>
              </MobileTotalItem>
              <MobileTotalItem>
                <MobileTotalLabel>{t('inventory.quantity')}</MobileTotalLabel>
                <MobileTotalValue>{purchaseTotals.quantity}</MobileTotalValue>
              </MobileTotalItem>
            </MobileTotalBar>

            <TableWrapper>
              <Table
                columns={purchaseColumns}
                data={purchasePagination.pageData}
                loading={isLoading}
                emptyMessage={t('suppliers.noTransactions')}
                tfoot={
                  <tr>
                    <TotalTd colSpan={2}>{t('pos.total')}</TotalTd>
                    <TotalTd>{formatCurrency(purchaseTotals.amount)}</TotalTd>
                    <TotalTd>{purchaseTotals.quantity} {t('reports.items').toLowerCase()}</TotalTd>
                  </tr>
                }
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
          </CollapseBody>
        </Section>

        <Divider />

        {/* ── PAYMENTS / RETURNS / ADVANCES ────────────────────────────────── */}
        <Section>
          <CollapseHeader onClick={() => setPaymentOpen((v) => !v)}>
            <SectionTitle>{t('suppliers.transactions')}</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                onClick={(e) => { e.stopPropagation(); setShowTransactionForm(true); }}
              >
                <Plus size={24} /> {t('suppliers.addTransaction')}
              </Button>
              {paymentOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CollapseHeader>

          <CollapseBody $open={paymentOpen}>
            <MobileTotalBar>
              <MobileTotalItem>
                <MobileTotalLabel>{t('pos.total')}</MobileTotalLabel>
                <MobileTotalValue>
                  <AmountCell $negative={paymentTotals.amount < 0}>
                    {paymentTotals.amount < 0 ? '-' : '+'}
                    {formatCurrency(Math.abs(paymentTotals.amount))}
                  </AmountCell>
                </MobileTotalValue>
              </MobileTotalItem>
            </MobileTotalBar>

            <TableWrapper>
              <Table
                columns={paymentColumns}
                data={paymentPagination.pageData}
                loading={isLoading}
                emptyMessage={t('suppliers.noTransactions')}
                tfoot={
                  <tr>
                    <TotalTd colSpan={3}>{t('pos.total')}</TotalTd>
                    <TotalTd>
                      <AmountCell $negative={paymentTotals.amount < 0}>
                        {paymentTotals.amount < 0 ? '-' : '+'}
                        {formatCurrency(Math.abs(paymentTotals.amount))}
                      </AmountCell>
                    </TotalTd>
                    <TotalTd colSpan={2} />
                  </tr>
                }
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
          </CollapseBody>
        </Section>
      </TablesRow>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showTransactionForm && id && (
        <SupplierTransactionForm
          supplierId={id}
          onSubmit={handleCreateTransaction}
          onCancel={() => setShowTransactionForm(false)}
          currentUserId={user?.id || ''}
        />
      )}

      {transactionToEdit && id && (
        <SupplierTransactionForm
          supplierId={id}
          transaction={transactionToEdit}
          onSubmit={handleEditTransaction}
          onCancel={() => setTransactionToEdit(null)}
          currentUserId={user?.id || ''}
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

      {showEditModal && selectedSupplier && (
        <SupplierManagementModal
          initialView="form"
          initialEditSupplier={selectedSupplier}
          onClose={() => setShowEditModal(false)}
          onSupplierChanged={() => id && getById(id)}
        />
      )}
    </Container>
  );
}
