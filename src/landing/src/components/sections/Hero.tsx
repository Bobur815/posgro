import styled from "styled-components";
import { Download, LogIn } from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL, PANEL_URL } from "../../config";
import { gradient } from "../../styles/brand";
import { PrimaryCta, SecondaryCta } from "../common/Buttons";

const Wrap = styled.section`
  padding: 84px 0 64px;
  text-align: center;
`;

const H1 = styled.h1`
  margin: 0 0 18px;
  font-size: clamp(30px, 5.5vw, 52px);
  line-height: 1.1;
  letter-spacing: -0.03em;
`;

const Accent = styled.span<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const Lede = styled.p`
  margin: 0 auto 32px;
  max-width: 640px;
  font-size: 17px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

export function Hero() {
  const { t, dark } = useLanding();

  return (
    <Wrap>
      <H1>
        <Accent $dark={dark}>POSGRO</Accent> — {t("hero.title")}
      </H1>
      <Lede>{t("hero.lede")}</Lede>
      <CtaRow>
        <PrimaryCta $dark={dark} href={DASHBOARD_URL}>
          <LogIn size={18} />
          {t("hero.cta")}
        </PrimaryCta>
        <SecondaryCta href={PANEL_URL}>
          <Download size={18} />
          {t("hero.download")}
        </SecondaryCta>
      </CtaRow>
    </Wrap>
  );
}
