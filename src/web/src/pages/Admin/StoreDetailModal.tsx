import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { X, RefreshCw } from 'lucide-react';
import { stores, StoreRecord, StoreStats } from '../../api/client';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 10px;
  width: 100%;
  max-width: 540px;
  padding: 24px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 20px 0 10px;
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
`;

const StatCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 12px 16px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const PlanCard = styled.div<{ $pro?: boolean }>`
  border: 2px solid ${({ $pro, theme }) => $pro ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const PlanRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const PlanLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const PlanBadge = styled.span<{ $pro?: boolean }>`
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  background: ${({ $pro, theme }) => $pro ? theme.colors.primary : theme.colors.border};
  color: ${({ $pro, theme }) => $pro ? '#fff' : theme.colors.textSecondary};
`;

const PlanNote = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 12px;
  line-height: 1.5;
`;

const PlanToggleRow = styled.div`
  display: flex;
  gap: 8px;
`;

const PlanBtn = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ $active }) => $active ? '#fff' : 'inherit'};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  margin-top: 8px;
`;

interface Props {
  store: StoreRecord;
  onClose: () => void;
  onUpdated: () => void;
}

export function StoreDetailModal({ store, onClose, onUpdated }: Props) {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [currentPlan, setCurrentPlan] = useState(store.plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPlan(store.plan);
    setLoadingStats(true);
    stores.getStats(store.id)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, [store]);

  const handlePlanChange = async (plan: 'free' | 'paid') => {
    if (plan === currentPlan) return;
    setSaving(true);
    setError(null);
    try {
      await stores.update(store.id, { plan });
      setCurrentPlan(plan);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const revenue = stats?.stats.totalRevenue ?? 0;

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Modal>
        <ModalHeader>
          <div>
            <ModalTitle>{store.name}</ModalTitle>
            {store.address && (
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{store.address}</div>
            )}
          </div>
          <CloseBtn onClick={onClose}><X size={18} /></CloseBtn>
        </ModalHeader>

        {/* Stats */}
        <SectionTitle>Statistics</SectionTitle>
        {loadingStats ? (
          <div style={{ display: 'flex', gap: 8, color: '#6b7280', fontSize: 14 }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
          </div>
        ) : (
          <StatGrid>
            <StatCard>
              <StatLabel>Total Sales</StatLabel>
              <StatValue>{stats?.stats.totalSales?.toLocaleString() ?? '—'}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Revenue (UZS)</StatLabel>
              <StatValue>
                {revenue
                  ? revenue.toLocaleString('ru-UZ', { maximumFractionDigits: 0 })
                  : '—'}
              </StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Products</StatLabel>
              <StatValue>{stats?.stats.productsCount ?? '—'}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Users</StatLabel>
              <StatValue>{stats?.stats.usersCount ?? '—'}</StatValue>
            </StatCard>
          </StatGrid>
        )}

        {/* AI Plan */}
        <SectionTitle>AI Invoice Scanning Plan</SectionTitle>
        <PlanCard $pro={currentPlan === 'paid'}>
          <PlanRow>
            <PlanLabel>Current Plan</PlanLabel>
            <PlanBadge $pro={currentPlan === 'paid'}>
              {currentPlan === 'paid' ? 'Pro' : 'Free'}
            </PlanBadge>
          </PlanRow>

          {currentPlan === 'free' ? (
            <PlanNote>
              Free plan uses PaddleOCR (open-source, $0/scan). Limited accuracy on complex
              Uzbekistan invoices (PDF, multi-page, dense tables). Upgrade to Pro for Claude Vision.
            </PlanNote>
          ) : (
            <PlanNote>
              Pro plan uses Claude Vision AI. Billed at <strong>$0.052 / scan</strong> (Anthropic
              cost + 30% margin). Accurate parsing of SoliqServis e-invoices with MXIK codes.
            </PlanNote>
          )}

          <PlanToggleRow>
            <PlanBtn
              $active={currentPlan === 'free'}
              onClick={() => handlePlanChange('free')}
              disabled={saving}
            >
              Free (PaddleOCR)
            </PlanBtn>
            <PlanBtn
              $active={currentPlan === 'paid'}
              onClick={() => handlePlanChange('paid')}
              disabled={saving}
            >
              Pro (Claude Vision)
            </PlanBtn>
          </PlanToggleRow>

          {error && <ErrorMsg>{error}</ErrorMsg>}
        </PlanCard>

        {/* Info */}
        <SectionTitle>Store Info</SectionTitle>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.8 }}>
          <div><strong>ID:</strong> {store.id}</div>
          <div><strong>Phone:</strong> {store.phone ?? '—'}</div>
          <div><strong>Status:</strong> {store.active ? 'Active' : 'Inactive'}</div>
          <div><strong>Created:</strong> {new Date(store.createdAt).toLocaleDateString()}</div>
        </div>
      </Modal>
    </Overlay>
  );
}
