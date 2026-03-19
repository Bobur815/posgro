import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';
import { DateInput } from '@components/common/DateInput';
import { Modal } from '@components/common/Modal';
import {
  SupplierTransaction,
  SupplierTransactionType,
  SupplierPaymentMethod,
} from '@shared/types';
import {
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_I18N_KEYS,
} from '@shared/constants/payment-methods';


const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

const TRANSACTION_TYPES: SupplierTransactionType[] = [
  'PURCHASE',
  'PAYMENT',
  'RETURN',
  'ADVANCE',
  'ADJUSTMENT',
];


interface SupplierTransactionFormProps {
  supplierId: string;
  transaction?: SupplierTransaction;
  onSubmit: (data: {
    supplierId: string;
    type: SupplierTransactionType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    dueDate?: string;
    createdBy: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  currentUserId: string;
}

export function SupplierTransactionForm({
  supplierId,
  transaction,
  onSubmit,
  onCancel,
  currentUserId,
}: SupplierTransactionFormProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(transaction);

  const [formData, setFormData] = useState({
    type: 'PURCHASE' as SupplierTransactionType,
    paymentMethod: 'CASH' as SupplierPaymentMethod,
    amount: '',
    description: '',
    dueDate: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (transaction) {
      setFormData({
        type: transaction.type,
        paymentMethod: transaction.paymentMethod,
        amount: Math.abs(transaction.amount).toString(),
        description: transaction.description || '',
        dueDate: transaction.dueDate
          ? new Date(transaction.dueDate).toISOString().split('T')[0]
          : '',
      });
    }
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      setError(t('common.error'));
      setIsLoading(false);
      return;
    }

    try {
      const success = await onSubmit({
        supplierId,
        type: formData.type,
        paymentMethod: formData.paymentMethod,
        amount,
        description: formData.description || undefined,
        dueDate: formData.dueDate || undefined,
        createdBy: currentUserId,
      });

      if (!success) {
        setError(t('common.error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getTransactionTypeLabel = (type: SupplierTransactionType) => {
    const labels: Record<SupplierTransactionType, string> = {
      PURCHASE: t('suppliers.purchase'),
      PAYMENT: t('suppliers.payment'),
      RETURN: t('suppliers.return'),
      ADVANCE: t('suppliers.advance'),
      ADJUSTMENT: t('suppliers.adjustment'),
    };
    return labels[type];
  };


  return (
    <Modal
      title={isEdit ? t('suppliers.editTransaction') : t('suppliers.addTransaction')}
      onClose={onCancel}
    >
        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label>{t('suppliers.transactionType')}</Label>
            <Select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              disabled={isEdit}
            >
              {TRANSACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getTransactionTypeLabel(type)}
                </option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>{t('suppliers.paymentMethod')}</Label>
            <Select
              value={formData.paymentMethod}
              onChange={(e) => handleChange('paymentMethod', e.target.value)}
            >
              {SUPPLIER_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(SUPPLIER_PAYMENT_METHOD_I18N_KEYS[method])}
                </option>
              ))}
            </Select>
          </FormGroup>

          <Input
            label={t('suppliers.amount')}
            type="number"
            min="0"
            step="0.01"
            value={formData.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            required
          />

          <Input
            label={t('suppliers.description')}
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
          />

          {formData.paymentMethod === 'INSTALLMENT' && (
            <DateInput
              label={t('suppliers.dueDate')}
              value={formData.dueDate}
              onChange={(val) => handleChange('dueDate', val)}
            />
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Actions>
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || !formData.amount}>
              {isLoading ? t('common.saving') : t('common.save')}
            </Button>
          </Actions>
        </Form>
    </Modal>
  );
}
