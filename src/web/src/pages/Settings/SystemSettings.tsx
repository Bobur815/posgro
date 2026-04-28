import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import {
  settings as settingsApi,
  receipt as receiptApi,
} from "../../api/client";
import { useNavigate } from "react-router-dom";
import { TopBar } from "./DevicesPage";

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
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
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
const SuccessText = styled.p`
  color: ${({ theme }) => theme.colors.success};
  font-size: 14px;
  margin: 0;
`;
const PlanBadge = styled.span<{ $pro?: boolean }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $pro, theme }) =>
    $pro ? theme.colors.primary : theme.colors.border};
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

  const [storeSettings, setStoreSettings] = useState({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeStir: "",
    taxRate: "0",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [balanceUzs, setBalanceUzs] = useState<number | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    loadSettings();
    loadPlan();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await settingsApi.getAll();
      setStoreSettings({
        storeName: allSettings.store_name || "",
        storeAddress: allSettings.store_address || "",
        storePhone: allSettings.store_phone || "",
        storeStir: allSettings.store_stir || "",
        taxRate: allSettings.tax_rate || "0",
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const loadPlan = async () => {
    setPlanLoading(true);
    try {
      const data = await receiptApi.getPlan();
      setPlan(data.plan);
      setBalanceUzs(
        data.plan === "paid" && typeof data.balance_uzs === "number"
          ? data.balance_uzs
          : null,
      );
    } catch (error) {
      console.error("Failed to load plan:", error);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      await settingsApi.set("store_name", storeSettings.storeName);
      await settingsApi.set("store_address", storeSettings.storeAddress);
      await settingsApi.set("store_phone", storeSettings.storePhone);
      await settingsApi.set("store_stir", storeSettings.storeStir);
      await settingsApi.set("tax_rate", storeSettings.taxRate);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveStatus("idle");
    }
  };

  return (
    <Container>
      <TopBar>
        <Button
          size="medium"
          variant="secondary"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft size={24} />
        </Button>
        <Title>{t("settings.systemSettings")}</Title>
      </TopBar>

      <Section>
        <SectionTitle>{t("settings.storeInformation")}</SectionTitle>
        <Form onSubmit={handleSaveStore}>
          <Input
            label={t("settings.storeName")}
            value={storeSettings.storeName}
            onChange={(e) =>
              setStoreSettings((prev) => ({
                ...prev,
                storeName: e.target.value,
              }))
            }
          />
          <Input
            label={t("settings.storeAddress")}
            value={storeSettings.storeAddress}
            onChange={(e) =>
              setStoreSettings((prev) => ({
                ...prev,
                storeAddress: e.target.value,
              }))
            }
          />
          <Row>
            <Input
              label={t("settings.storePhone")}
              value={storeSettings.storePhone}
              onChange={(e) =>
                setStoreSettings((prev) => ({
                  ...prev,
                  storePhone: e.target.value,
                }))
              }
            />
            <Input
              label={t("settings.storeStir")}
              value={storeSettings.storeStir}
              onChange={(e) =>
                setStoreSettings((prev) => ({
                  ...prev,
                  storeStir: e.target.value,
                }))
              }
            />
          </Row>
          <Row>
            <Input
              label={t("settings.taxRate")}
              type="number"
              step="0.01"
              value={storeSettings.taxRate}
              onChange={(e) =>
                setStoreSettings((prev) => ({
                  ...prev,
                  taxRate: e.target.value,
                }))
              }
            />
          </Row>
          <Actions>
            <Button type="submit" disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? t("common.saving") : t("common.save")}
            </Button>
            {saveStatus === "saved" && (
              <SuccessText>{t("common.saved")}</SuccessText>
            )}
          </Actions>
        </Form>
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

        {plan === "paid" && (
          <PlanCard $pro>
            <StatRow>
              <StatLabel>{t("aiSettings.creditBalance")}</StatLabel>
              <StatValue>
                {balanceUzs !== null
                  ? `${balanceUzs.toLocaleString("ru-UZ", { maximumFractionDigits: 0 })} so'm`
                  : "—"}
              </StatValue>
            </StatRow>
            <InfoText style={{ marginTop: "8px", fontSize: 12, opacity: 0.7 }}>
              {t("aiSettings.proPlanNote")}
            </InfoText>
          </PlanCard>
        )}

        <Actions style={{ marginTop: "12px" }}>
          <Button
            onClick={loadPlan}
            disabled={planLoading}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: planLoading ? "spin 1s linear infinite" : "none",
              }}
            />
            {t("aiSettings.refreshPlan")}
          </Button>
        </Actions>
      </Section>
    </Container>
  );
}
