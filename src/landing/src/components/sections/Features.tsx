import styled from "styled-components";
import {
  WifiOff,
  Receipt,
  ShieldCheck,
  Printer,
  Network,
  LineChart,
} from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import type { StringKey } from "../../i18n";
import { INFO } from "../../styles/brand";
import { Section, SectionTitle, SectionLede } from "../common/Section";

const FEATURES: Array<{ icon: typeof WifiOff; t: StringKey; d: StringKey }> = [
  { icon: WifiOff, t: "features.offline.t", d: "features.offline.d" },
  { icon: Receipt, t: "features.fiscal.t", d: "features.fiscal.d" },
  { icon: ShieldCheck, t: "features.marking.t", d: "features.marking.d" },
  { icon: Printer, t: "features.hardware.t", d: "features.hardware.d" },
  { icon: Network, t: "features.multi.t", d: "features.multi.d" },
  { icon: LineChart, t: "features.dashboard.t", d: "features.dashboard.d" },
];

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
`;

const Card = styled.div`
  padding: 26px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`;

/** A tinted tile, not the gradient: the gradient is kept for the calls to action. */
const Icon = styled.div`
  background: ${INFO.tint};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  color: ${INFO.main};
  margin-bottom: 14px;
`;

const Title = styled.h3`
  margin: 0 0 8px;
  font-size: 17px;
`;

const Text = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function Features() {
  const { t } = useLanding();

  return (
    <Section id="features">
      <SectionTitle>{t("features.title")}</SectionTitle>
      {/* Empty on purpose for now: it only supplies the spacing under the title. */}
      <SectionLede />
      <Grid>
        {FEATURES.map(({ icon: FeatureIcon, t: title, d }) => (
          <Card key={title}>
            <Icon>
              <FeatureIcon size={21} />
            </Icon>
            <Title>{t(title)}</Title>
            <Text>{t(d)}</Text>
          </Card>
        ))}
      </Grid>
    </Section>
  );
}
