import styled, { css } from "styled-components";
import { Check } from "lucide-react";
import type { LandingPlan } from "@shared/types/landing.types";
import { useLanding } from "../../context/LandingContext";
import { formatPrice } from "../../i18n";
import { BRAND, gradient } from "../../styles/brand";

const Card = styled.div<{ $featured: boolean; $dark: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 30px 26px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.surface};
  border: ${({ $featured, theme }) =>
    $featured ? "2px solid transparent" : `1px solid ${theme.colors.border}`};
  ${({ $featured, $dark }) =>
    $featured &&
    css`
      /* Gradient border without a wrapper: paint the surface, then the brand gradient, and let
         the border box show only the second. */
      background-image:
        linear-gradient(var(--surface), var(--surface)),
        linear-gradient(
          135deg,
          ${$dark ? BRAND.dark.from : BRAND.light.from},
          ${$dark ? BRAND.dark.to : BRAND.light.to}
        );
      background-origin: border-box;
      background-clip: padding-box, border-box;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    `}
`;

const Badge = styled.span<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 14px;
  border-radius: 999px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
`;

const Name = styled.div`
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 4px;
`;

const Tagline = styled.div`
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 20px;
  min-height: 44px;
`;

const Price = styled.div`
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

const PriceUnit = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: 6px;
`;

const FeatureList = styled.ul`
  list-style: none;
  margin: 22px 0 26px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  flex: 1;
`;

const FeatureItem = styled.li`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  line-height: 1.5;
  svg {
    flex: 0 0 auto;
    margin-top: 2px;
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Cta = styled.a<{ $featured: boolean; $dark: boolean }>`
  display: block;
  text-align: center;
  padding: 13px;
  border-radius: 9px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  ${({ $featured, $dark, theme }) =>
    $featured
      ? css`
          ${gradient($dark)}
          color: #fff;
        `
      : css`
          border: 1px solid ${theme.colors.border};
          color: ${theme.colors.text};
        `}
  &:hover {
    opacity: 0.9;
  }
`;

interface PlanCardProps {
  plan: LandingPlan;
  price: number;
  href: string;
}

export function PlanCard({ plan, price, href }: PlanCardProps) {
  const { t, ru, dark } = useLanding();
  const features = ru ? plan.featuresRu : plan.featuresUz;

  return (
    <Card $featured={plan.highlighted} $dark={dark}>
      {plan.highlighted && <Badge $dark={dark}>{t("pricing.popular")}</Badge>}
      <Name>{(ru ? plan.nameRu : plan.nameUz) || plan.id}</Name>
      <Tagline>{ru ? plan.taglineRu : plan.taglineUz}</Tagline>
      <Price>
        {formatPrice(price)}
        <PriceUnit>
          {t("pricing.sum")}
          {plan.id === "vip" ? ` ${t("pricing.once")}` : t("pricing.month")}
        </PriceUnit>
      </Price>
      <FeatureList>
        {features.map((f, i) => (
          <FeatureItem key={i}>
            <Check size={16} />
            <span>{f}</span>
          </FeatureItem>
        ))}
      </FeatureList>
      <Cta $featured={plan.highlighted} $dark={dark} href={href}>
        {t("pricing.cta")}
      </Cta>
    </Card>
  );
}
