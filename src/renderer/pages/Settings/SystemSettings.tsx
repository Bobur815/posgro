import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RefreshCw } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";

const Container = styled.div`
  max-width: 800px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Section = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const InfoText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin: 0;
`;

const PlanBadge = styled.span<{ $pro?: boolean }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $pro, theme }) => ($pro ? theme.colors.primary : theme.colors.border)};
  color: ${({ $pro, theme }) => ($pro ? "#fff" : theme.colors.textSecondary)};
  margin-left: 8px;
  vertical-align: middle;
`;

const PlanCard = styled.div<{ $pro?: boolean }>`
  border: 1px solid
    ${({ $pro, theme }) => ($pro ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const StatLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const StatValue = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

export function SystemSettings() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    taxRate: "0",
    syncInterval: "5",
  });

  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSyncTime: string | null;
  }>({ isSyncing: false, lastSyncTime: null });

  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [scanUsage, setScanUsage] = useState<{
    scans: number;
    costUsd: number;
    month: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
    loadPlan();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await window.electronAPI.settings.getAll();
      setSettings((prev) => ({
        ...prev,
        storeName: allSettings.store_name || "",
        storeAddress: allSettings.store_address || "",
        storePhone: allSettings.store_phone || "",
        taxRate: allSettings.tax_rate || "0",
        syncInterval: allSettings.sync_interval || "5",
      }));
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await window.electronAPI.sync.getStatus();
      setSyncStatus(
        status as { isSyncing: boolean; lastSyncTime: string | null },
      );
    } catch (error) {
      console.error("Failed to load sync status:", error);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.settings.set("store_name", settings.storeName);
      await window.electronAPI.settings.set(
        "store_address",
        settings.storeAddress,
      );
      await window.electronAPI.settings.set("store_phone", settings.storePhone);
      await window.electronAPI.settings.set("tax_rate", settings.taxRate);
      alert(t("common.saved"));
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  const loadPlan = async () => {
    setPlanLoading(true);
    try {
      const { plan: p } = await window.electronAPI.receipt.getPlan();
      setPlan(p);
      if (p === "paid") {
        const usage = await window.electronAPI.receipt.getScanUsage();
        setScanUsage(usage);
      }
    } catch (error) {
      console.error("Failed to load plan:", error);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await window.electronAPI.sync.trigger();
      loadSyncStatus();
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  return (
    <Container>
      <Title>{t("settings.systemSettings")}</Title>

      <Section>
        <SectionTitle>{t("settings.storeInformation")}</SectionTitle>
        <Form onSubmit={handleSaveStore}>
          <Input
            label={t("settings.storeName")}
            value={settings.storeName}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, storeName: e.target.value }))
            }
          />
          <Input
            label={t("settings.storeAddress")}
            value={settings.storeAddress}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, storeAddress: e.target.value }))
            }
          />
          <Row>
            <Input
              label={t("settings.storePhone")}
              value={settings.storePhone}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, storePhone: e.target.value }))
              }
            />
            <Input
              label={t("settings.taxRate")}
              type="number"
              step="0.01"
              value={settings.taxRate}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, taxRate: e.target.value }))
              }
            />
          </Row>
          <Actions>
            <Button type="submit">{t("common.save")}</Button>
          </Actions>
        </Form>
      </Section>

      <Section>
        <SectionTitle>{t("settings.synchronization")}</SectionTitle>
        <InfoText>
          {t("settings.syncInterval")}: {settings.syncInterval}{" "}
          {t("settings.minutes")}
        </InfoText>
        <InfoText>
          {t("settings.lastSync")}:{" "}
          {syncStatus.lastSyncTime
            ? new Date(syncStatus.lastSyncTime).toLocaleString()
            : t("settings.never")}
        </InfoText>
        <Actions>
          <Button onClick={handleTriggerSync} disabled={syncStatus.isSyncing}>
            {syncStatus.isSyncing
              ? t("settings.syncing")
              : t("settings.syncNow")}
          </Button>
        </Actions>
      </Section>

      <Section>
        <SectionTitle>
          {t("aiSettings.title")}
          {plan === "paid" && (
            <PlanBadge $pro>{t("aiSettings.proPlanBadge")}</PlanBadge>
          )}
          {plan === "free" && (
            <PlanBadge>{t("aiSettings.freePlanBadge")}</PlanBadge>
          )}
        </SectionTitle>

        {plan === "free" && (
          <PlanCard>
            <InfoText style={{ marginBottom: "8px" }}>
              {t("aiSettings.freePlanNote")}
            </InfoText>
            <InfoText style={{ color: "inherit" }}>
              {t("aiSettings.freePlanContact")}
            </InfoText>
          </PlanCard>
        )}

        {plan === "paid" && scanUsage !== null && (
          <PlanCard $pro>
            <InfoText style={{ marginBottom: "12px", fontWeight: 500, color: "inherit" }}>
              {t("aiSettings.proPlanNote")} —{" "}
              {new Date(scanUsage.month + "-01").toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </InfoText>
            <StatRow>
              <StatLabel>{t("aiSettings.scansThisMonth")}</StatLabel>
              <StatValue>{scanUsage.scans.toLocaleString()}</StatValue>
            </StatRow>
            <StatRow>
              <StatLabel>
                {t("aiSettings.estimatedCharge")}{" "}
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  ({t("aiSettings.pricePerScan")})
                </span>
              </StatLabel>
              <StatValue>${scanUsage.costUsd.toFixed(2)}</StatValue>
            </StatRow>
          </PlanCard>
        )}

        <Actions style={{ marginTop: "12px" }}>
          <Button
            onClick={loadPlan}
            disabled={planLoading}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={14} style={{ animation: planLoading ? "spin 1s linear infinite" : "none" }} />
            {t("aiSettings.refreshPlan")}
          </Button>
        </Actions>
      </Section>
    </Container>
  );
}
