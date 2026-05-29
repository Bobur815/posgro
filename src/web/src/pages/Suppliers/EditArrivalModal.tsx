import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';
import { Modal } from '@components/common/Modal';
import { inventory as inventoryApi } from '../../api/client';
import { amountHint } from '@shared/utils';
import { SupplierTransaction } from '@shared/types';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FlexRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  > * { flex: 1; min-width: 0; }
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

interface EditArrivalModalProps {
  transaction: SupplierTransaction;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditArrivalModal({ transaction, onClose, onSuccess }: EditArrivalModalProps) {
  const { t, i18n } = useTranslation();

  // amount on PURCHASE is negative (we owe). referenceId is the arrival id.
  const totalCost = Math.abs(transaction.amount);

  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState(transaction.description ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction.referenceId) {
      setError(t('common.error'));
      return;
    }
    const payload: { quantity?: number; cost?: number; notes?: string } = {};
    if (quantity) {
      const q = parseFloat(quantity);
      if (isNaN(q) || q <= 0) { setError(t('common.error')); return; }
      payload.quantity = q;
    }
    if (cost) {
      const c = parseFloat(cost);
      if (isNaN(c) || c < 0) { setError(t('common.error')); return; }
      payload.cost = c;
    }
    payload.notes = notes || undefined;

    setIsLoading(true);
    setError('');
    try {
      await inventoryApi.updateArrival(transaction.referenceId, payload);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal title={t('inventory.editArrival')} onClose={onClose}>
      <Form onSubmit={handleSubmit}>
        <FlexRow>
          <div>
            <Input
              label={t('inventory.quantity')}
              type="number"
              step="1"
              placeholder={t('inventory.currentValue')}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div>
            <Input
              label={t('inventory.costPerUnit')}
              type="number"
              step="1000"
              placeholder={t('inventory.currentValue')}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            {cost && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, fontStyle: 'italic' }}>
                {amountHint(cost, i18n.language)}
              </div>
            )}
          </div>
        </FlexRow>

        <div style={{ fontSize: 13, color: 'gray' }}>
          {t('inventory.currentTotal')}: {totalCost.toLocaleString()}
        </div>

        <Input
          label={t('inventory.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <Actions>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading || (!quantity && !cost)}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </Actions>
      </Form>
    </Modal>
  );
}
