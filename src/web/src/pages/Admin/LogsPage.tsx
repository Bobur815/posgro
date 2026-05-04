import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { RefreshCw } from "lucide-react";
import {
  logs,
  type LogsMeta,
  type LogsQueryParams,
  type LogsResponse,
  type TerminalLogEntry,
} from "../../api/client";

// ─── Styled Components ──────────────────────────��────────────────────────────

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
  &:hover {
    opacity: 0.8;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
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
  padding: 14px 16px;
  font-size: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  vertical-align: top;
`;

const LevelBadge = styled.span<{ $level: string }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${({ $level, theme }) =>
    $level === "error"
      ? `${theme.colors.error}20`
      : $level === "warn"
        ? "#f59e0b20"
        : `${theme.colors.primary}20`};
  color: ${({ $level, theme }) =>
    $level === "error"
      ? theme.colors.error
      : $level === "warn"
        ? "#d97706"
        : theme.colors.primary};
`;

const Message = styled.span`
  font-family: "Consolas", "Courier New", monospace;
  font-size: 13px;
  word-break: break-all;
  white-space: pre-wrap;
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
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  background: ${({ theme, $active }) =>
    $active ? `${theme.colors.primary}20` : theme.colors.surface};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.text};
  font-size: 15px;
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// ─── Component ───────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LogsPage() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LogsMeta>({ stores: [], terminalsByStore: {} });

  const [level, setLevel] = useState("");
  const [storeId, setStoreId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    logs.getMeta().then(setMeta).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (params: LogsQueryParams) => {
    setLoading(true);
    setError(null);
    try {
      const result = await logs.getLogs(params);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  const buildParams = useCallback((): LogsQueryParams => {
    const params: LogsQueryParams = { page, limit: 50 };
    if (level) params.level = level;
    if (storeId) params.storeId = storeId;
    if (terminalId) params.terminalId = terminalId;
    if (from) params.from = new Date(from).toISOString();
    if (to) params.to = new Date(to).toISOString();
    return params;
  }, [page, level, storeId, terminalId, from, to]);

  useEffect(() => {
    fetchLogs(buildParams());
  }, [fetchLogs, buildParams]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => fetchLogs(buildParams()), 60_000);
    return () => clearInterval(id);
  }, [fetchLogs, buildParams]);

  const handleFilterChange = () => setPage(1);

  return (
    <Page>
      <Header>
        <Title>Terminal Logs</Title>
        <IconButton onClick={() => fetchLogs(buildParams())} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </IconButton>
      </Header>

      <Filters>
        <Select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            handleFilterChange();
          }}
        >
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </Select>

        <Select
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setTerminalId("");
            handleFilterChange();
          }}
        >
          <option value="">All stores</option>
          {meta.stores.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>

        <Select
          value={terminalId}
          disabled={!storeId}
          onChange={(e) => {
            setTerminalId(e.target.value);
            handleFilterChange();
          }}
        >
          <option value="">All terminals</option>
          {(storeId ? meta.terminalsByStore[storeId] ?? [] : []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            handleFilterChange();
          }}
          title="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            handleFilterChange();
          }}
          title="To date"
        />
      </Filters>

      {error && <div style={{ color: "red", fontSize: 15 }}>{error}</div>}

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 160 }}>Timestamp</Th>
              <Th style={{ width: 120 }}>Terminal</Th>
              <Th style={{ width: 70 }}>Level</Th>
              <Th>Message</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && data?.items.length === 0 && (
              <EmptyRow>
                <td colSpan={4}>No logs found</td>
              </EmptyRow>
            )}
            {data?.items.map((entry: TerminalLogEntry) => (
              <tr key={entry.id}>
                <Td style={{ whiteSpace: "nowrap" }}>
                  {formatTimestamp(entry.timestamp)}
                </Td>
                <Td style={{ fontFamily: "monospace" }}>
                  {entry.terminalId}
                </Td>
                <Td>
                  <LevelBadge $level={entry.level}>{entry.level}</LevelBadge>
                </Td>
                <Td>
                  <Message>{entry.message}</Message>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      {data && data.pages > 1 && (
        <Pagination>
          <span>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} of{" "}
            {data.total} entries
          </span>
          <PaginationButtons>
            <PageButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev
            </PageButton>
            {Array.from({ length: Math.min(5, data.pages) }, (_, i) => {
              const p = Math.max(1, Math.min(data.pages - 4, page - 2)) + i;
              return (
                <PageButton
                  key={p}
                  $active={p === page}
                  onClick={() => setPage(p)}
                >
                  {p}
                </PageButton>
              );
            })}
            <PageButton
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
            >
              Next →
            </PageButton>
          </PaginationButtons>
        </Pagination>
      )}
    </Page>
  );
}
