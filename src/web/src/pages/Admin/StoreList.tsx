import React, { useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { Plus, RefreshCw, Pencil, Trash2, ToggleLeft, ToggleRight, BarChart2 } from 'lucide-react';
import { stores, StoreRecord } from '../../api/client';
import { StoreFormModal } from './StoreFormModal';
import { StoreDetailModal } from './StoreDetailModal';

const Page = styled.div`
  padding: 24px;
  max-width: 1100px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: ${({ theme }) => theme.colors.text};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) =>
    $variant === 'danger' ? theme.colors.error : $variant === 'primary' ? theme.colors.primary : theme.colors.border};
  background: ${({ $variant, theme }) =>
    $variant === 'primary' ? theme.colors.primary : 'transparent'};
  color: ${({ $variant, theme }) =>
    $variant === 'primary' ? '#fff' : $variant === 'danger' ? theme.colors.error : theme.colors.text};
  &:hover { opacity: 0.8; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const IconBtn = styled.button<{ $color?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ $color, theme }) => $color ?? theme.colors.textSecondary};
  cursor: pointer;
  &:hover { opacity: 0.7; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
`;

const Badge = styled.span<{ $green?: boolean; $blue?: boolean; $gray?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $green, $blue, $gray, theme }) =>
    $green ? '#dcfce7' : $blue ? '#dbeafe' : $gray ? theme.colors.border : theme.colors.border};
  color: ${({ $green, $blue, $gray, theme }) =>
    $green ? '#16a34a' : $blue ? '#2563eb' : $gray ? theme.colors.textSecondary : theme.colors.textSecondary};
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const Empty = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  padding: 12px;
  border-radius: 6px;
  background: #fef2f2;
  margin-bottom: 16px;
  font-size: 14px;
`;

export function StoreList() {
  const [list, setList] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formStore, setFormStore] = useState<StoreRecord | null | 'new'>(null);
  const [detailStore, setDetailStore] = useState<StoreRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await stores.getAll();
      setList(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async (store: StoreRecord) => {
    try {
      if (store.active) {
        await stores.deactivate(store.id);
      } else {
        await stores.activate(store.id);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (store: StoreRecord) => {
    if (!confirm(`Delete store "${store.name}"? This cannot be undone.`)) return;
    try {
      await stores.delete(store.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Page>
      <Header>
        <Title>Stores</Title>
        <Actions>
          <Btn $variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </Btn>
          <Btn $variant="primary" onClick={() => setFormStore('new')}>
            <Plus size={14} />
            New Store
          </Btn>
        </Actions>
      </Header>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <Table>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Plan</Th>
            <Th>Users</Th>
            <Th>Products</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><Td colSpan={7}><Empty>Loading…</Empty></Td></tr>
          ) : list.length === 0 ? (
            <tr><Td colSpan={7}><Empty>No stores yet. Create one.</Empty></Td></tr>
          ) : list.map((store) => (
            <tr key={store.id}>
              <Td>{store._count?.users ?? '—'}</Td>
              <Td>{store.id}</Td>
              <Td>
                <div style={{ fontWeight: 600 }}>{store.name}</div>
                {store.address && (
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{store.address}</div>
                )}
              </Td>
              <Td>{store.phone ?? '—'}</Td>
              <Td>
                {store.plan === 'paid'
                  ? <Badge $blue>Pro</Badge>
                  : <Badge $gray>Free</Badge>}
              </Td>
              <Td>{store._count?.users ?? '—'}</Td>
              <Td>{store._count?.products ?? '—'}</Td>
              <Td>
                {store.active
                  ? <Badge $green>Active</Badge>
                  : <Badge $gray>Inactive</Badge>}
              </Td>
              <Td>
                <RowActions>
                  <IconBtn title="Stats / AI plan" onClick={() => setDetailStore(store)}>
                    <BarChart2 size={15} />
                  </IconBtn>
                  <IconBtn title="Edit" onClick={() => setFormStore(store)}>
                    <Pencil size={15} />
                  </IconBtn>
                  <IconBtn
                    title={store.active ? 'Deactivate' : 'Activate'}
                    onClick={() => handleToggleActive(store)}
                    $color={store.active ? '#f59e0b' : '#16a34a'}
                  >
                    {store.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                  </IconBtn>
                  <IconBtn
                    title="Delete"
                    $color="#ef4444"
                    onClick={() => handleDelete(store)}
                  >
                    <Trash2 size={15} />
                  </IconBtn>
                </RowActions>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {formStore !== null && (
        <StoreFormModal
          store={formStore === 'new' ? null : formStore}
          onClose={() => setFormStore(null)}
          onSaved={load}
        />
      )}

      {detailStore !== null && (
        <StoreDetailModal
          store={detailStore}
          onClose={() => setDetailStore(null)}
          onUpdated={load}
        />
      )}
    </Page>
  );
}
