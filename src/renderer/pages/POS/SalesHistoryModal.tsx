import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Modal } from '../../components/common/Modal';
import { useSales } from '../../hooks/useSales';
import type { Sale } from '@shared/types/sale.types';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { ChevronDown, ChevronRight, Pencil, Printer, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const SaleRow = styled.div<{ $expanded?: boolean }>`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  ${({ $expanded, theme }) => $expanded && `border-color: ${theme.colors.primary};`}
`;

const SaleHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  gap: ${({ theme }) => theme.spacing.sm};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const SaleInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex: 1;
  min-width: 0;
`;

const ReceiptNum = styled.span`
  font-weight: 600;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
`;

const Time = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const Badge = styled.span<{ $method?: string }>`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
  background-color: ${({ theme, $method }) =>
    $method === 'card' ? theme.colors.primary + '15' : theme.colors.success + '15'};
  color: ${({ theme, $method }) =>
    $method === 'card' ? theme.colors.primary : theme.colors.success};
`;

const Amount = styled.span`
  font-weight: 700;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
`;

const ItemsPanel = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.background};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`;

const ItemLine = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border}50;
  }
`;

const ItemName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ItemQty = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const EditButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}10;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const PrintButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    border-color: ${({ theme }) => theme.colors.textSecondary};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const DeleteButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}10;
    border-color: ${({ theme }) => theme.colors.error};
  }
`;

interface SalesHistoryModalProps {
  onClose: () => void;
  onEditSale: (sale: Sale) => void;
}

export function SalesHistoryModal({ onClose, onEditSale }: SalesHistoryModalProps) {
  const { t, i18n } = useTranslation();
  const { sales, isLoading, loadSales, deleteSale } = useSales();
  const toast = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const formatCurrency = (amount: number) => formatCurrencyBase(amount, i18n.language as 'ru' | 'uz');

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    const success = await deleteSale(deleteConfirmId);
    if (success) {
      window.dispatchEvent(new Event('stock-updated'));
      toast.success(t('pos.saleDeleted'));
    } else {
      toast.error(t('common.error'));
    }
    setDeleteConfirmId(null);
  };

  const handlePrint = async (saleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.printer.printReceipt(saleId);
      toast.success(t('pos.receiptPrinted'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    loadSales({ startDate: today.toISOString() });
  }, [loadSales]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      title={`${t('pos.salesHistory')} — ${t('pos.today')}`}
      onClose={onClose}
      width="600px"
    >
      {isLoading ? (
        <LoadingText>{t('common.loading')}</LoadingText>
      ) : sales.length === 0 ? (
        <EmptyText>{t('pos.noSales')}</EmptyText>
      ) : (
        <List>
          {sales.map((sale) => {
            const expanded = expandedId === sale.id;
            return (
              <SaleRow key={sale.id} $expanded={expanded}>
                <SaleHeader onClick={() => setExpandedId(expanded ? null : sale.id)}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <SaleInfo>
                    <ReceiptNum>#{sale.receiptNumber}</ReceiptNum>
                    <Time>{formatTime(sale.createdAt)}</Time>
                    <Badge $method={sale.paymentMethod}>
                      {sale.paymentMethod === 'card' ? t('pos.card') : t('pos.cash')}
                    </Badge>
                  </SaleInfo>
                  <Amount>{formatCurrency(sale.finalAmount)}</Amount>
                  <PrintButton
                    onClick={(e) => handlePrint(sale.id, e)}
                    title={t('pos.printReceipt')}
                  >
                    <Printer size={16} />
                  </PrintButton>
                  <EditButton
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSale(sale);
                    }}
                    title={t('common.edit')}
                  >
                    <Pencil size={16} />
                  </EditButton>
                  <DeleteButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(sale.id);
                    }}
                    title={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </DeleteButton>
                </SaleHeader>
                {expanded && sale.items && (
                  <ItemsPanel>
                    {sale.items.map((item) => (
                      <ItemLine key={item.productId}>
                        <ItemName>{item.productName}</ItemName>
                        <ItemQty>{item.quantity} x {formatCurrency(item.unitPrice)}</ItemQty>
                        <span>{formatCurrency(item.subtotal)}</span>
                      </ItemLine>
                    ))}
                  </ItemsPanel>
                )}
              </SaleRow>
            );
          })}
        </List>
      )}
      {deleteConfirmId && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('pos.deleteSaleConfirm')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </Modal>
  );
}
