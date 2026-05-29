import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { RefreshCw, Save } from "lucide-react";
import { siteConfig, SubscriptionPlanPrices } from "../../api/client";

const Page = styled.div`
  padding: 32px;
  max-width: 900px;
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

const Subtitle = styled.p`
  margin: 6px 0 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div<{ $accent?: string }>`
  border: 2px solid ${({ $accent, theme }) => $accent ?? theme.colors.border};
  border-radius: 10px;
  padding: 24px;
  background: ${({ theme }) => theme.colors.surface};
`;

const PlanName = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 700;
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
  margin-bottom: 4px;
`;

const PlanDesc = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 20px;
  line-height: 1.5;
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 15px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const SaveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const SuccessMsg = styled.div`
  color: #16a34a;
  font-size: 14px;
  margin-top: 12px;
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  margin-top: 12px;
`;

const PLANS = [
  {
    key: "starter" as keyof SubscriptionPlanPrices,
    name: "STARTER",
    desc: "Basic POS features for small stores. Monthly subscription.",
    color: "#16a34a",
    accent: "#bbf7d0",
  },
  {
    key: "pro" as keyof SubscriptionPlanPrices,
    name: "PRO",
    desc: "Full features — analytics, multi-terminal, invoice scanning. Monthly subscription.",
    color: "#2563eb",
    accent: "#bfdbfe",
  },
  {
    key: "vip" as keyof SubscriptionPlanPrices,
    name: "VIP",
    desc: "Perpetual license for clients who purchased the app outright. All features, no expiry.",
    color: "#7c3aed",
    accent: "#e9d5ff",
  },
];

export function SubscriptionPlansPage() {
  const [prices, setPrices] = useState<SubscriptionPlanPrices>({ starter: 0, pro: 0, vip: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    siteConfig
      .getSubscriptionPlans()
      .then(setPrices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      await siteConfig.setSubscriptionPlans(prices);
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <Header>
        <div>
          <Title>Subscription Plans</Title>
          <Subtitle>Set monthly prices (UZS) for each plan. VIP is a one-time purchase price.</Subtitle>
        </div>
      </Header>

      {loading ? (
        <div style={{ display: "flex", gap: 8, color: "#6b7280" }}>
          <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          Loading…
        </div>
      ) : (
        <>
          <Grid>
            {PLANS.map(({ key, name, desc, color, accent }) => (
              <Card key={key} $accent={accent}>
                <PlanName $color={color}>{name}</PlanName>
                <PlanDesc>{desc}</PlanDesc>
                <Label>
                  {key === "vip" ? "One-time price (UZS)" : "Monthly price (UZS)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={prices[key]}
                  onChange={(e) =>
                    setPrices((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                />
              </Card>
            ))}
          </Grid>

          <SaveBtn onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? "Saving…" : "Save Prices"}
          </SaveBtn>

          {success && <SuccessMsg>Prices saved successfully.</SuccessMsg>}
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </>
      )}
    </Page>
  );
}
