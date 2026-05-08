import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useSales } from '../../hooks/useSales';
import type { Sale } from '@shared/types/sale.types';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';
import { ChevronDown, ChevronRight, Pencil, Printer, Trash2, Link } from 'lucide-react';
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

const PaynetBadge = styled.span`
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
  background-color: ${({ theme }) => theme.colors.success + '20'};
  color: ${({ theme }) => theme.colors.success};
  border: 1px solid ${({ theme }) => theme.colors.success + '40'};
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

const IconButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
`;

const EditButton = styled(IconButton)`
  color: ${({ theme }) => theme.colors.primary};
  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}10;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const PrintButton = styled(IconButton)`
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    border-color: ${({ theme }) => theme.colors.textSecondary};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const DeleteButton = styled(IconButton)`
  color: ${({ theme }) => theme.colors.error};
  &:hover {
    background-color: ${({ theme }) => theme.colors.error}10;
    border-color: ${({ theme }) => theme.colors.error};
  }
`;

// ─── Paynet Integration Modal ─────────────────────────────────────────────────

const PaynetModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PaynetModalInfo = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const PaynetCard = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ $selected, theme }) => $selected ? theme.colors.success : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ $selected, theme }) => $selected ? theme.colors.success + '12' : theme.colors.surface};
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
  &:hover { border-color: ${({ theme }) => theme.colors.success}; }
`;

const PaynetCardLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PaynetCardReceipt = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const PaynetCardAmount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaynetEmpty = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const ModalActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;
`;

interface PaynetReceipt {
  id: string;
  receiptNumber: string;
  fiscalMark: string;
  ofdUrl: string;
  amount: number | null;
  issuedAt: string;
}

interface PaynetIntegrationModalProps {
  sale: Sale;
  onClose: () => void;
  onIntegrated: () => void;
  formatCurrency: (n: number) => string;
}

function PaynetIntegrationModal({ sale, onClose, onIntegrated, formatCurrency }: PaynetIntegrationModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [receipts, setReceipts] = useState<PaynetReceipt[]>([]);
  const [selected, setSelected] = useState<PaynetReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [integrating, setIntegrating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list: PaynetReceipt[] = await window.electronAPI.paynetReceipts.getByAmount(sale.finalAmount);
        setReceipts(list);
        // Auto-select receipt with matching amount
        const match = list.find(r => r.amount != null && Math.abs(r.amount - sale.finalAmount) < 1);
        setSelected(match ?? (list.length === 1 ? list[0] : null));
      } finally {
        setLoading(false);
      }
    })();
  }, [sale.finalAmount]);

  const handleIntegrate = async () => {
    if (!selected) return;
    setIntegrating(true);
    try {
      await window.electronAPI.paynetReceipts.integrate(selected.id, sale.receiptNumber, selected.receiptNumber, selected.ofdUrl);
      toast.success(t('paynet.integrated'));
      onIntegrated();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIntegrating(false);
    }
  };

  return (
    <Modal title={t('paynet.linkReceipt')} onClose={onClose} width="480px">
      <PaynetModalContent>
        <PaynetModalInfo>
          {t('pos.receipt')} #{sale.receiptNumber} — {formatCurrency(sale.finalAmount)}
        </PaynetModalInfo>

        {loading ? (
          <PaynetEmpty>{t('common.loading')}</PaynetEmpty>
        ) : receipts.length === 0 ? (
          <PaynetEmpty>{t('paynet.noReceipts')}</PaynetEmpty>
        ) : (
          receipts.map((pr) => (
            <PaynetCard
              key={pr.id}
              $selected={selected?.id === pr.id}
              onClick={() => setSelected(pr)}
            >
              <PaynetCardLeft>
                <PaynetCardReceipt>#{pr.receiptNumber}</PaynetCardReceipt>
                <PaynetCardAmount>
                  {pr.amount != null ? formatCurrency(pr.amount) : '—'} ·{' '}
                  {new Date(pr.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </PaynetCardAmount>
              </PaynetCardLeft>
              {selected?.id === pr.id && <span style={{ fontSize: 18 }}>✓</span>}
            </PaynetCard>
          ))
        )}

        <ModalActions>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleIntegrate} disabled={!selected || integrating}>
            {integrating ? t('common.processing') : t('paynet.link')}
          </Button>
        </ModalActions>
      </PaynetModalContent>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  const [paynetSale, setPaynetSale] = useState<Sale | null>(null);

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

  const handlePrint = useCallback(async (sale: Sale, e: React.MouseEvent) => {
    e.stopPropagation();
    // If not yet linked to a Paynet receipt, open integration modal first
    if (!sale.paynetReceiptNumber) {
      setPaynetSale(sale);
      return;
    }
    try {
      await window.electronAPI.printer.printReceipt(sale.id);
      toast.success(t('pos.receiptPrinted'));
    } catch {
      toast.error(t('common.error'));
    }
  }, [t, toast]);

  const handleIntegrated = useCallback(async () => {
    if (!paynetSale) return;
    setPaynetSale(null);
    // Reload sales so the badge updates, then print
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await loadSales({ startDate: today.toISOString() });
    try {
      await window.electronAPI.printer.printReceipt(paynetSale.id);
      toast.success(t('pos.receiptPrinted'));
    } catch {
      toast.error(t('common.error'));
    }
  }, [paynetSale, loadSales, t, toast]);

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
    <>
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
                      {sale.paynetReceiptNumber && (
                        <PaynetBadge>Paynet ✓</PaynetBadge>
                      )}
                    </SaleInfo>
                    <Amount>{formatCurrency(sale.finalAmount)}</Amount>
                    <PrintButton
                      onClick={(e) => handlePrint(sale, e)}
                      title={t('pos.printReceipt')}
                    >
                      <Printer size={16} />
                      {!sale.paynetReceiptNumber && <Link size={12} />}
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

      {paynetSale && (
        <PaynetIntegrationModal
          sale={paynetSale}
          onClose={() => setPaynetSale(null)}
          onIntegrated={handleIntegrated}
          formatCurrency={formatCurrency}
        />
      )}
    </>
  );
}
