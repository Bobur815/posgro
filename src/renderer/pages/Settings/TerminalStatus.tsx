import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/common/Button";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding-left: 25px;
`;

const BackButton = styled(Button)``;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Card = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const StatusDot = styled.span<{ online: boolean }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: ${({ online, theme }) =>
    online ? theme.colors.success : theme.colors.error};
  margin-right: 8px;
`;

const Badge = styled.span<{ warn: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ warn, theme }) =>
    warn ? theme.colors.error : theme.colors.success};
  color: #fff;
`;

const EmptyText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;


interface TerminalStatusEntry {
  terminalId: string;
  lastSyncAt: string;
  unsyncedCount: number;
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "< 1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function TerminalStatus() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<TerminalStatusEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.terminals.getStatus();
      setStatuses(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load terminal status",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Container>
      <Header>
        <BackButton variant="secondary" size="small" onClick={() => navigate('/settings')}>
          <ArrowLeft size={20} />
        </BackButton>
        <Title>{t("settings.terminalStatus")}</Title>
        <Button onClick={load} disabled={isLoading} style={{ marginLeft: 'auto', marginRight: 24 }}>
          {isLoading ? t("common.loading") : t("common.refresh")}
        </Button>
      </Header>

      <Card>
        {error && <EmptyText>{error}</EmptyText>}
        {!error && statuses.length === 0 && !isLoading && (
          <EmptyText>{t("settings.noTerminalData")}</EmptyText>
        )}
        {statuses.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>{t("settings.terminalId")}</Th>
                <Th>{t("settings.status")}</Th>
                <Th>{t("settings.lastSync")}</Th>
                <Th>{t("settings.unsyncedSales")}</Th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => {
                const isOnline =
                  Date.now() - new Date(s.lastSyncAt).getTime() <
                  OFFLINE_THRESHOLD_MS;
                return (
                  <tr key={s.terminalId}>
                    <Td>
                      <strong>{s.terminalId}</strong>
                    </Td>
                    <Td>
                      <StatusDot online={isOnline} />
                      {isOnline ? t("settings.online") : t("settings.offline")}
                    </Td>
                    <Td>{formatRelative(s.lastSyncAt)}</Td>
                    <Td>
                      <Badge warn={s.unsyncedCount > 0}>
                        {s.unsyncedCount}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </Container>
  );
}
