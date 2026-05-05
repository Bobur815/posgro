import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { RefreshCw } from "lucide-react";
import {
  auditLogs,
  type AuditLogsMeta,
  type AuditLogsQueryParams,
  type AuditLogsResponse,
  type AuditLogEntry,
} from "../../api/client";
import { useAuthStore } from "../../store/auth-store";

// ─── Styled Components ────────────────────────────────────────────────────────

const Page = styled.div`
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  max-width: 1400px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`;

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  width: 180px;
`;

const PhoneInput = styled(Input)`
  width: 160px;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  &:hover { opacity: 0.8; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const TableWrapper = styled.div`
  flex: 1;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.textSecondary};
  position: sticky;
  top: 0;
`;

const Td = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  vertical-align: top;
`;

const ActionBadge = styled.span<{ $type: "create" | "delete" | "update" | "other" }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: ${({ $type, theme }) =>
    $type === "create" ? `${theme.colors.success ?? "#22c55e"}20`
    : $type === "delete" ? `${theme.colors.error}20`
    : $type === "update" ? "#f59e0b20"
    : `${theme.colors.primary}20`};
  color: ${({ $type, theme }) =>
    $type === "create" ? (theme.colors.success ?? "#16a34a")
    : $type === "delete" ? theme.colors.error
    : $type === "update" ? "#d97706"
    : theme.colors.primary};
`;

const DetailsText = styled.span`
  font-family: "Consolas", "Courier New", monospace;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  word-break: break-all;
`;

const EmptyRow = styled.tr`
  td {
    text-align: center;
    padding: 56px;
    font-size: 16px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 6px 14px;
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  background: ${({ theme, $active }) => $active ? `${theme.colors.primary}20` : theme.colors.surface};
  color: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.text};
  font-size: 15px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function actionType(action: string): "create" | "delete" | "update" | "other" {
  if (action.startsWith("create_")) return "create";
  if (action.startsWith("delete_")) return "delete";
  if (action.startsWith("update_")) return "update";
  return "other";
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

function formatDetails(raw: string | null): string {
  if (!raw) return "—";
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  } catch {
    return raw;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const LIMIT = 50;

export function AuditLogsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<AuditLogsMeta>({ stores: [], actions: [], entities: [] });

  const [storeId, setStoreId] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    auditLogs.getMeta().then(setMeta).catch(() => {});
  }, []);

  const buildParams = useCallback((): AuditLogsQueryParams => {
    const params: AuditLogsQueryParams = { page, limit: LIMIT };
    if (storeId) params.storeId = storeId;
    if (phone) params.phone = phone;
    if (action) params.action = action;
    if (entity) params.entity = entity;
    if (from) params.from = new Date(from).toISOString();
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      params.to = toDate.toISOString();
    }
    return params;
  }, [page, storeId, phone, action, entity, from, to]);

  const fetch = useCallback(async (params: AuditLogsQueryParams) => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditLogs.getAuditLogs(params);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(buildParams());
  }, [fetch, buildParams]);

  const reset = () => setPage(1);

  return (
    <Page>
      <Header>
        <Title>Audit Logs</Title>
        <IconButton onClick={() => fetch(buildParams())} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </IconButton>
      </Header>

      <Filters>
        {isSuperAdmin && (
          <Select value={storeId} onChange={(e) => { setStoreId(e.target.value); reset(); }}>
            <option value="">All stores</option>
            {meta.stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        )}

        <PhoneInput
          type="text"
          placeholder="Phone..."
          value={phone}
          onChange={(e) => { setPhone(e.target.value); reset(); }}
        />

        <Select value={action} onChange={(e) => { setAction(e.target.value); reset(); }}>
          <option value="">All actions</option>
          {meta.actions.map((a) => (
            <option key={a} value={a}>{formatAction(a)}</option>
          ))}
        </Select>

        <Select value={entity} onChange={(e) => { setEntity(e.target.value); reset(); }}>
          <option value="">All entities</option>
          {meta.entities.map((en) => (
            <option key={en} value={en}>{en}</option>
          ))}
        </Select>

        <Input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); reset(); }}
          title="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); reset(); }}
          title="To date"
        />
      </Filters>

      {error && <div style={{ color: "red", fontSize: 15 }}>{error}</div>}

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 160 }}>Time</Th>
              {isSuperAdmin && <Th style={{ width: 140 }}>Store</Th>}
              <Th style={{ width: 120 }}>Phone</Th>
              <Th style={{ width: 140 }}>Action</Th>
              <Th style={{ width: 90 }}>Entity</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && data?.items.length === 0 && (
              <EmptyRow>
                <td colSpan={isSuperAdmin ? 6 : 5}>No audit logs found</td>
              </EmptyRow>
            )}
            {data?.items.map((entry: AuditLogEntry) => (
              <tr key={entry.id}>
                <Td style={{ whiteSpace: "nowrap" }}>{formatTs(entry.createdAt)}</Td>
                {isSuperAdmin && (
                  <Td style={{ fontFamily: "monospace", fontSize: 13 }}>
                    {entry.store?.name ?? entry.storeId}
                  </Td>
                )}
                <Td style={{ fontFamily: "monospace" }}>{entry.phone}</Td>
                <Td>
                  <ActionBadge $type={actionType(entry.action)}>
                    {formatAction(entry.action)}
                  </ActionBadge>
                </Td>
                <Td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{entry.entity}</Td>
                <Td>
                  <DetailsText>{formatDetails(entry.details)}</DetailsText>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      {data && data.pages > 1 && (
        <Pagination>
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} of {data.total} entries
          </span>
          <PaginationButtons>
            <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ← Prev
            </PageButton>
            {Array.from({ length: Math.min(5, data.pages) }, (_, i) => {
              const p = Math.max(1, Math.min(data.pages - 4, page - 2)) + i;
              return (
                <PageButton key={p} $active={p === page} onClick={() => setPage(p)}>
                  {p}
                </PageButton>
              );
            })}
            <PageButton onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page === data.pages}>
              Next →
            </PageButton>
          </PaginationButtons>
        </Pagination>
      )}
    </Page>
  );
}
