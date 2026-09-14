import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BarChart2,
  Undo2,
} from "lucide-react";
import { stores, siteConfig, StoreRecord } from "../../api/client";
import { formatPhone } from "@shared/utils/phone";
import {
  DEFAULT_SUBSCRIPTION_RULES,
  storeSubscriptionFacts,
  subscriptionStatus,
  type SubscriptionRules,
} from "@shared/utils/subscription";
import { StoreFormModal } from "./StoreFormModal";
import { StoreDetailModal } from "./StoreDetailModal";

const Page = styled.div`
  padding: 32px;
  max-width: 1400px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  color: ${({ theme }) => theme.colors.text};
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
`;

const Btn = styled.button<{ $variant?: "primary" | "ghost" | "danger" }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid
    ${({ $variant, theme }) =>
      $variant === "danger"
        ? theme.colors.error
        : $variant === "primary"
          ? theme.colors.primary
          : theme.colors.border};
  background: ${({ $variant, theme }) =>
    $variant === "primary" ? theme.colors.primary : "transparent"};
  color: ${({ $variant, theme }) =>
    $variant === "primary"
      ? "#fff"
      : $variant === "danger"
        ? theme.colors.error
        : theme.colors.text};
  &:hover {
    opacity: 0.8;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const IconBtn = styled.button<{ $color?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ $color, theme }) => $color ?? theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    opacity: 0.7;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
`;

const Badge = styled.span<{
  $green?: boolean;
  $blue?: boolean;
  $gray?: boolean;
  $red?: boolean;
  $purple?: boolean;
  $amber?: boolean;
}>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $green, $blue, $red, $purple, $amber, theme }) =>
    $purple
      ? "#f3e8ff"
      : $green
        ? "#dcfce7"
        : $blue
          ? "#dbeafe"
          : $red
            ? "#fef2f2"
            : $amber
              ? "#fef3c7"
              : theme.colors.border};
  color: ${({ $green, $blue, $red, $purple, $amber, theme }) =>
    $purple
      ? "#7c3aed"
      : $green
        ? "#16a34a"
        : $blue
          ? "#2563eb"
          : $red
            ? "#ef4444"
            : $amber
              ? "#b45309"
              : theme.colors.textSecondary};
`;

const SubscriptionNote = styled.div<{ $color: string }>`
  font-size: 12px;
  color: ${({ $color }) => $color};
  margin-top: 4px;
  white-space: nowrap;
`;

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

/** Where a store's subscription stands, under its plan badge (shared/utils/subscription.ts). */
function subscriptionLine(store: StoreRecord, rules: SubscriptionRules) {
  const s = subscriptionStatus(storeSubscriptionFacts(store), rules);
  switch (s.state) {
    case "active":
      return { text: `Until ${day(s.expiresAt)}`, color: "#6b7280" };
    case "warning":
      return { text: `Expires ${day(s.expiresAt)}`, color: "#b45309" };
    case "grace":
      return { text: `Expired · blocks ${day(s.blockAt)}`, color: "#ef4444" };
    case "blocked":
      return {
        text: s.blockAt ? `Blocked since ${day(s.blockAt)}` : "Blocked — no plan",
        color: "#ef4444",
      };
    default:
      return null;
  }
}

const RowActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const Empty = styled.div`
  text-align: center;
  padding: 56px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  padding: 14px;
  border-radius: 8px;
  background: #fef2f2;
  margin-bottom: 20px;
  font-size: 15px;
`;

const DeletedNote = styled.div`
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
`;

export function StoreList() {
  const [list, setList] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formStore, setFormStore] = useState<StoreRecord | null | "new">(null);
  const [detailStore, setDetailStore] = useState<StoreRecord | null>(null);
  const [rules, setRules] = useState<SubscriptionRules>(DEFAULT_SUBSCRIPTION_RULES);

  useEffect(() => {
    siteConfig
      .getSubscriptionRules()
      .then(setRules)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await stores.getAll();
      setList(data);
      // An open details screen shows the store as just saved, not as it was when opened.
      setDetailStore((open) => (open && data.find((s) => s.id === open.id)) || open);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    if (
      !confirm(
        `Schedule "${store.name}" for deletion? It will be permanently deleted in 30 days.`,
      )
    )
      return;
    try {
      await stores.delete(store.id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (e as Error).message);
    }
  };

  const handleCancelDelete = async (store: StoreRecord) => {
    try {
      await stores.cancelDelete(store.id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (e as Error).message);
    }
  };

  return (
    <Page>
      <Header>
        <Title>Stores</Title>
        <Actions>
          <Btn $variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </Btn>
          <Btn $variant="primary" onClick={() => setFormStore("new")}>
            <Plus size={16} />
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
            <Th>Terminals</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <Td colSpan={10}>
                <Empty>Loading…</Empty>
              </Td>
            </tr>
          ) : list.length === 0 ? (
            <tr>
              <Td colSpan={10}>
                <Empty>No stores yet. Create one.</Empty>
              </Td>
            </tr>
          ) : (
            list.map((store, i) => (
              <tr key={store.id}>
                <Td>{i + 1}</Td>
                <Td>{store.id}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{store.name}</div>
                  {store.address && (
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      {store.address}
                    </div>
                  )}
                  {store.scheduledDeleteAt && (
                    <DeletedNote>
                      Deletes{" "}
                      {new Date(store.scheduledDeleteAt).toLocaleDateString()}
                    </DeletedNote>
                  )}
                </Td>
                <Td>{store.phone ? formatPhone(store.phone) : "—"}</Td>
                <Td>
                  {store.subscriptionPlan === "VIP" ? (
                    <Badge $purple>VIP</Badge>
                  ) : store.subscriptionPlan === "PRO" ? (
                    <Badge $blue>PRO</Badge>
                  ) : store.subscriptionPlan === "STARTER" ? (
                    <Badge $green>STARTER</Badge>
                  ) : store.subscriptionPlan === "TRIAL" ? (
                    <Badge $amber>TRIAL</Badge>
                  ) : (
                    <Badge $gray>No Plan</Badge>
                  )}
                  {(() => {
                    const line = subscriptionLine(store, rules);
                    return line && <SubscriptionNote $color={line.color}>{line.text}</SubscriptionNote>;
                  })()}
                </Td>
                <Td>{store._count?.users ?? "—"}</Td>
                <Td>{store._count?.products ?? "—"}</Td>
                <Td>{store._count?.terminalHeartbeats ?? "—"}</Td>
                <Td>
                  {store.scheduledDeleteAt ? (
                    <Badge $red>Pending delete</Badge>
                  ) : store.active ? (
                    <Badge $green>Active</Badge>
                  ) : (
                    <Badge $gray>Inactive</Badge>
                  )}
                </Td>
                <Td>
                  <RowActions>
                    <IconBtn
                      title="Stats / AI plan"
                      onClick={() => setDetailStore(store)}
                    >
                      <BarChart2 size={17} />
                    </IconBtn>
                    <IconBtn title="Edit" onClick={() => setFormStore(store)}>
                      <Pencil size={17} />
                    </IconBtn>
                    {store.scheduledDeleteAt ? (
                      <IconBtn
                        title="Cancel deletion"
                        $color="#16a34a"
                        onClick={() => handleCancelDelete(store)}
                      >
                        <Undo2 size={17} />
                      </IconBtn>
                    ) : (
                      <>
                        <IconBtn
                          title={store.active ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleActive(store)}
                          $color={store.active ? "#f59e0b" : "#16a34a"}
                        >
                          {store.active ? (
                            <ToggleRight size={17} />
                          ) : (
                            <ToggleLeft size={17} />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Schedule deletion (30 days)"
                          $color="#ef4444"
                          onClick={() => handleDelete(store)}
                        >
                          <Trash2 size={17} />
                        </IconBtn>
                      </>
                    )}
                  </RowActions>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {formStore !== null && (
        <StoreFormModal
          store={formStore === "new" ? null : formStore}
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
