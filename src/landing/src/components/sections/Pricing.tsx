import styled from "styled-components";
import type { LandingPlan } from "@shared/types/landing.types";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL } from "../../config";
import type { Prices } from "../../content";
import { Section, SectionTitle, SectionLede } from "../common/Section";
import { PlanCard } from "./PlanCard";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 20px;
  align-items: start;
`;

interface PricingProps {
  plans: LandingPlan[];
  prices: Prices;
  telegram?: string;
}

export function Pricing({ plans, prices, telegram }: PricingProps) {
  const { t } = useLanding();
  /** An empty ctaUrl falls back to Telegram — one link to change, not three. */
  const planHref = (p: LandingPlan) => p.ctaUrl || telegram || DASHBOARD_URL;

  return (
    <Section id="pricing">
      <SectionTitle>{t("pricing.title")}</SectionTitle>
      <SectionLede>{t("pricing.lede")}</SectionLede>
      <Grid>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            price={prices[plan.id] ?? 0}
            href={planHref(plan)}
          />
        ))}
      </Grid>
    </Section>
  );
}
