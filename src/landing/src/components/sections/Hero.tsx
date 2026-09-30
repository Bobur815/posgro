import { useState } from "react";
import styled from "styled-components";
import { Download, Send } from "lucide-react";
import type { LandingHeroVideo } from "@shared/types/landing.types";
import { useLanding } from "../../context/LandingContext";
import { PANEL_URL } from "../../config";
import { gradientOnDark, HERO_FALLBACK } from "../../styles/brand";
import { PrimaryCta, SecondaryCta } from "../common/Buttons";
import { LeadModal } from "../common/LeadModal";
import { HEADER_H } from "../layout/Header";
import { HeroVideo } from "./HeroVideo";

/**
 * Full width, pulled up under the floating sticky header (the video shows around its sides). The
 * height never depends on the video or the network, so nothing shifts when the poster or the video
 * arrives.
 */
const Wrap = styled.section`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(100vh, 760px);
  min-height: min(100svh, 760px);
  margin-top: -${HEADER_H}px;
  padding: ${HEADER_H + 32}px 24px 48px;
  text-align: center;
  color: #fff;
  background: ${HERO_FALLBACK};

  @media (max-width: 768px) {
    min-height: 560px;
  }
`;

/** Keeps white text readable over any frame. */
const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgba(12, 12, 12, 0.8);
  pointer-events: none;
`;

const Content = styled.div`
  position: relative;
  z-index: 2;
  max-width: 1080px;
`;

const H1 = styled.h1`
  margin: 0 0 18px;
  font-size: clamp(30px, 5.5vw, 52px);
  line-height: 1.1;
  letter-spacing: -0.03em;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
`;

/** The paler brand pair: the text sits on the hero's dark overlay. */
const Accent = styled.span`
  ${gradientOnDark}
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const Lede = styled.p`
  margin: 0 auto 32px;
  max-width: 640px;
  font-size: 17px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.88);
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

export function Hero({ video }: { video: LandingHeroVideo | null }) {
  const { t } = useLanding();
  const [leadOpen, setLeadOpen] = useState(false);

  return (
    <>
      <Wrap>
        <HeroVideo video={video} />
        <Overlay />
        <Content>
          <H1>
            <Accent>POSGRO</Accent> — {t("hero.title")}
          </H1>
          <Lede>{t("hero.lede")}</Lede>
          <CtaRow>
            <PrimaryCta
              as="button"
              type="button"
              onClick={() => setLeadOpen(true)}
            >
              <Send size={18} />
              {t("hero.cta")}
            </PrimaryCta>
            <SecondaryCta href={PANEL_URL}>
              <Download size={18} />
              {t("hero.download")}
            </SecondaryCta>
          </CtaRow>
        </Content>
      </Wrap>
      {/* Outside Wrap: the dialog would inherit its centred white text. */}
      <LeadModal open={leadOpen} onClose={() => setLeadOpen(false)} />
    </>
  );
}
