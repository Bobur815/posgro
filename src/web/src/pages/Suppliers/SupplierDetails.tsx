import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';
import { Table } from '@components/common/Table';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { SupplierTransactionForm } from './SupplierTransactionForm';
import { SupplierForm } from './SupplierForm';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useAuthStore } from '../../store/auth-store';
import { useToast } from '@context/ToastContext';
import {
  SupplierTransaction,
  SupplierTransactionType,
  SupplierTransactionCreateType,
  SupplierPaymentMethod,
} from '@shared/types';
import { SUPPLIER_PAYMENT_METHOD_I18N_KEYS } from '@shared/constants/payment-methods';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { formatDate } from '../../utils/formatters';
import { ArrowLeft, Edit, Trash } from 'lucide-react';
import { MobileCard, MobileCardList, DesktopOnly } from '../../components/common/MobileCard';

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

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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
  const [showEditForm, setShowEditForm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] =
    useState<SupplierTransaction | null>(null);
  const [transactionToEdit, setTransactionToEdit] =
    useState<SupplierTransaction | null>(null);

  useEffect(() => {
    if (id) {
      getById(id);
    }
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

  if (isLoading && !selectedSupplier) {
    return <Container>{t('common.loading')}</Container>;
  }

  if (!selectedSupplier) {
    return <Container>{t('suppliers.noSuppliers')}</Container>;
  }

  const columns = [
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
      render: (tx: SupplierTransaction) => getPaymentMethodLabel(tx.paymentMethod),
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
      ),
    },
  ];

  const supplierName =
    i18n.language === 'uz' ? selectedSupplier.nameUz : selectedSupplier.nameRu;

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <Button variant="secondary" size="small" onClick={() => navigate("/suppliers")}>
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
          <InfoValue style={{ color: selectedSupplier.active ? undefined : '#ef4444' }}>
            {selectedSupplier.active ? t('suppliers.active') : t('suppliers.inactive')}
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

      <Section>
        <SectionHeader>
          <SectionTitle>{t('suppliers.transactionHistory')}</SectionTitle>
          <Button onClick={() => setShowTransactionForm(true)}>
            {t('suppliers.addTransaction')}
          </Button>
        </SectionHeader>

        <MobileCardList>
          {(selectedSupplier.transactions || []).map((tx: SupplierTransaction) => (
            <MobileCard
              key={tx.id}
              title={getTransactionTypeLabel(tx.type)}
              subtitle={formatDate(tx.createdAt)}
              fields={[
                { label: t('suppliers.paymentMethod'), value: getPaymentMethodLabel(tx.paymentMethod) },
                {
                  label: t('suppliers.amount'),
                  value: (
                    <AmountCell $negative={tx.amount < 0}>
                      {tx.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                    </AmountCell>
                  ),
                },
                { label: t('suppliers.description'), value: tx.description || '-' },
              ]}
              actions={
                <>
                  <Button size="small" variant="secondary" onClick={() => setTransactionToEdit(tx)}>
                    <Edit size={16} />
                  </Button>
                  <Button size="small" variant="danger" onClick={() => setTransactionToDelete(tx)}>
                    <Trash size={16} />
                  </Button>
                </>
              }
            />
          ))}
        </MobileCardList>

        <DesktopOnly>
          <Table
            columns={columns}
            data={selectedSupplier.transactions || []}
            loading={isLoading}
            emptyMessage={t('suppliers.noTransactions')}
          />
        </DesktopOnly>
      </Section>

      {showTransactionForm && id && (
        <SupplierTransactionForm
          supplierId={id}
          supplierProducts={(selectedSupplier as any).products ?? []}
          onSubmit={handleCreateTransaction}
          onCancel={() => setShowTransactionForm(false)}
          currentUserId={user?.id || ''}
        />
      )}

      {transactionToEdit && id && (
        <SupplierTransactionForm
          supplierId={id}
          transaction={transactionToEdit}
          supplierProducts={(selectedSupplier as any).products ?? []}
          onSubmit={handleEditTransaction}
          onCancel={() => setTransactionToEdit(null)}
          currentUserId={user?.id || ''}
        />
      )}

      {showEditForm && id && (
        <SupplierForm
          supplierId={id}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => { setShowEditForm(false); getById(id); }}
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
