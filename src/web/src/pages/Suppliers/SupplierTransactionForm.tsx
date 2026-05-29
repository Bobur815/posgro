import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';
import { Modal } from '@components/common/Modal';
import {
  SupplierTransaction,
  SupplierTransactionCreateType,
  SupplierProduct,
  SupplierPaymentMethod,
} from '@shared/types';
import {
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_I18N_KEYS,
} from '@shared/constants/payment-methods';
import { amountHint } from '@shared/utils';

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

const ToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: none;
  cursor: pointer;
  font-size: 13px;
  background: ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ $active }) => $active ? '#fff' : 'inherit'};
  transition: background 0.15s;
`;

const CalcAmount = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-family: monospace;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const AmountHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
  min-height: 16px;
  margin-top: 2px;
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

const TRANSACTION_TYPES: SupplierTransactionCreateType[] = ['PAYMENT', 'RETURN', 'ADVANCE'];

interface SupplierTransactionFormProps {
  supplierId: string;
  transaction?: SupplierTransaction;
  supplierProducts?: SupplierProduct[];
  onSubmit: (data: {
    supplierId: string;
    type: SupplierTransactionCreateType;
    paymentMethod: SupplierPaymentMethod;
    amount: number;
    description?: string;
    referenceId?: string;
    referenceType?: string;
    createdBy: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  currentUserId: string;
}

export function SupplierTransactionForm({
  supplierId,
  transaction,
  supplierProducts = [],
  onSubmit,
  onCancel,
  currentUserId,
}: SupplierTransactionFormProps) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(transaction);

  const [type, setType] = useState<SupplierTransactionCreateType>(
    (transaction?.type as SupplierTransactionCreateType) ?? 'PAYMENT'
  );
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>(
    transaction?.paymentMethod ?? 'CASH'
  );
  const [amount, setAmount] = useState(
    transaction ? Math.abs(transaction.amount).toString() : ''
  );
  const [description, setDescription] = useState(() => {
    const d = transaction?.description;
    if (!d) return '';
    if (typeof d === 'object' && 'text' in d) return String(d.text);
    if (typeof d === 'string') return d;
    return '';
  });
  const [returnMode, setReturnMode] = useState<'manual' | 'product'>('manual');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [manualCost, setManualCost] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedProduct = useMemo(
    () => supplierProducts.find((p) => String(p.id) === selectedProductId) ?? null,
    [supplierProducts, selectedProductId]
  );

  const calculatedAmount = useMemo(() => {
    if (!selectedProduct || !returnQty) return null;
    const qty = parseFloat(returnQty);
    if (isNaN(qty) || qty <= 0) return null;
    const unitCost = selectedProduct.cost !== null
      ? selectedProduct.cost
      : parseFloat(manualCost);
    if (!unitCost || isNaN(unitCost) || unitCost <= 0) return null;
    return qty * unitCost;
  }, [selectedProduct, returnQty, manualCost]);

  // When type changes away from RETURN, reset return-specific state
  useEffect(() => {
    if (type !== 'RETURN') {
      setReturnMode('manual');
      setSelectedProductId('');
      setReturnQty('');
      setManualCost('');
    }
  }, [type]);

  // Reset cost input when product changes
  useEffect(() => {
    setManualCost('');
    setReturnQty('');
  }, [selectedProductId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalAmount =
      type === 'RETURN' && returnMode === 'product'
        ? calculatedAmount
        : parseFloat(amount);

    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      setError(t('common.error'));
      return;
    }

    setIsLoading(true);
    try {
      const success = await onSubmit({
        supplierId,
        type,
        paymentMethod,
        amount: finalAmount,
        description: description || undefined,
        referenceId: type === 'RETURN' && returnMode === 'product' && selectedProduct
          ? String(selectedProduct.id)
          : undefined,
        referenceType: type === 'RETURN' && returnMode === 'product' ? 'PRODUCT' : undefined,
        createdBy: currentUserId,
      });

      if (!success) setError(t('common.error'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeLabel = (tp: SupplierTransactionCreateType) => {
    const labels: Record<SupplierTransactionCreateType, string> = {
      PAYMENT: t('suppliers.payment'),
      RETURN: t('suppliers.return'),
      ADVANCE: t('suppliers.advance'),
    };
    return labels[tp];
  };

  const isSubmitDisabled = isLoading || (() => {
    if (type === 'RETURN' && returnMode === 'product') {
      return !calculatedAmount;
    }
    return !amount;
  })();

  return (
    <Modal
      title={isEdit ? t('suppliers.editTransaction') : t('suppliers.addTransaction')}
      onClose={onCancel}
    >
      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label>{t('suppliers.transactionType')}</Label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as SupplierTransactionCreateType)}
            disabled={isEdit}
          >
            {TRANSACTION_TYPES.map((tp) => (
              <option key={tp} value={tp}>{getTypeLabel(tp)}</option>
            ))}
          </Select>
        </FormGroup>

        <FormGroup>
          <Label>{t('suppliers.paymentMethod')}</Label>
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as SupplierPaymentMethod)}
          >
            {SUPPLIER_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{t(SUPPLIER_PAYMENT_METHOD_I18N_KEYS[m])}</option>
            ))}
          </Select>
        </FormGroup>

        {type === 'RETURN' && supplierProducts.length > 0 && (
          <FormGroup>
            <Label>{t('suppliers.returnMode')}</Label>
            <ToggleGroup>
              <ToggleBtn
                type="button"
                $active={returnMode === 'manual'}
                onClick={() => setReturnMode('manual')}
              >
                {t('suppliers.returnManual')}
              </ToggleBtn>
              <ToggleBtn
                type="button"
                $active={returnMode === 'product'}
                onClick={() => setReturnMode('product')}
              >
                {t('suppliers.returnByProduct')}
              </ToggleBtn>
            </ToggleGroup>
          </FormGroup>
        )}

        {type === 'RETURN' && returnMode === 'product' ? (
          <>
            <FormGroup>
              <Label>{t('suppliers.selectProduct')}</Label>
              <Select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">—</option>
                {supplierProducts.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {i18n.language === 'uz' ? p.nameUz : p.nameRu} ({p.stock} {p.unit})
                  </option>
                ))}
              </Select>
            </FormGroup>

            {selectedProduct && (
              <>
                {selectedProduct.cost === null && (
                  <Input
                    label={t('suppliers.tannarx')}
                    type="number"
                    step="1000"
                    value={manualCost}
                    onChange={(e) => setManualCost(e.target.value)}
                  />
                )}
                <Input
                  label={`${t('suppliers.quantity')} (${selectedProduct.unit})`}
                  type="number"
                  step="1"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                />
              </>
            )}

            {calculatedAmount !== null && (
              <FormGroup>
                <Label>{t('suppliers.calculatedAmount')}</Label>
                <CalcAmount>{calculatedAmount.toLocaleString()}</CalcAmount>
              </FormGroup>
            )}
          </>
        ) : (
          <Label>
            <Input
              label={t('suppliers.amount')}
              type="number"
              step="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <AmountHint>{amountHint(amount, i18n.language)}</AmountHint>
          </Label>
        )}

        <Input
          label={t('suppliers.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Actions>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitDisabled}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </Actions>
      </Form>
    </Modal>
  );
}
