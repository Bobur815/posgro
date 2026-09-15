import React, { useEffect, useState } from 'react';
import styled, { ThemeProvider, createGlobalStyle, css } from 'styled-components';
import {
  WifiOff,
  Receipt,
  ShieldCheck,
  Printer,
  Network,
  LineChart,
  Check,
  Phone,
  Clock,
  Download,
  LogIn,
  Moon,
  Sun,
  Send,
  Instagram,
  Facebook,
  Link as LinkIcon,
} from 'lucide-react';
import { lightTheme, darkTheme, type Theme } from '@theme/themes';
import { translate, initialLang, saveLang, formatPrice, type Lang, type StringKey } from './i18n';
import { FALLBACK_PLANS, FALLBACK_PRICES, FALLBACK_CONTACT, type Prices } from './content';
import type { LandingPlan, LandingContact } from '@shared/types/landing.types';

/**
 * posgro.uz — the landing page.
 *
 * Renders the baked-in content from content.ts immediately, then fetches the live config and
 * swaps it in. Nothing waits on the network and nothing shows a spinner: with the API down the
 * page is complete and correct, which is exactly when someone is here looking for a phone number.
 *
 * Tariff copy, prices and contact details are edited in the dashboard, not here
 * (tasks/DOMAIN_MIGRATION_POSGRO.md §9.1).
 */

const DASHBOARD_URL = 'https://web.posgro.uz/web/';
const PANEL_URL = 'https://panel.posgro.uz';
const THEME_KEY = 'posgro-landing-theme';

/** The brand mark: the same gradient square and "PG" as the app icon (src/web/src/branding). */
const BRAND = {
  light: { from: '#1976d2', to: '#dc004e' },
  dark: { from: '#90caf9', to: '#f48fb1' },
};

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: background 0.2s ease, color 0.2s ease;
  }
  a { color: inherit; }
  section { scroll-margin-top: 80px; }
`;

const gradient = (dark: boolean) => css`
  background: linear-gradient(
    135deg,
    ${dark ? BRAND.dark.from : BRAND.light.from} 0%,
    ${dark ? BRAND.dark.to : BRAND.light.to} 100%
  );
`;

const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Brand = styled.a`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
  text-decoration: none;
  font-weight: 800;
  font-size: 19px;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
`;

const Mark = styled.span<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: -0.5px;
`;

const NavLink = styled.a`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
  @media (max-width: 860px) { display: none; }
`;

const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.primary}; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const LoginBtn = styled.a<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-radius: 9px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  &:hover { opacity: 0.9; }
`;

const Main = styled.main`
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 24px;
`;

const Hero = styled.section`
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

const PrimaryCta = styled.a<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 15px 30px;
  border-radius: 10px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  box-shadow: ${({ theme }) => theme.shadows.md};
  &:hover { opacity: 0.9; }
`;

const SecondaryCta = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 15px 30px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`;

const SectionTitle = styled.h2`
  margin: 0 0 8px;
  font-size: clamp(24px, 3.5vw, 32px);
  letter-spacing: -0.02em;
  text-align: center;
`;

const SectionLede = styled.p`
  margin: 0 auto 36px;
  max-width: 560px;
  text-align: center;
  font-size: 16px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Section = styled.section`
  padding: 56px 0;
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
`;

const Feature = styled.div`
  padding: 26px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`;

const FeatureIcon = styled.div<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  color: #fff;
  margin-bottom: 14px;
`;

const FeatureTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 17px;
`;

const FeatureText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PriceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 20px;
  align-items: start;
`;

const PlanCard = styled.div<{ $featured: boolean; $dark: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 30px 26px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.surface};
  border: ${({ $featured, theme }) =>
    $featured ? '2px solid transparent' : `1px solid ${theme.colors.border}`};
  ${({ $featured, $dark }) =>
    $featured &&
    css`
      /* Gradient border without a wrapper: paint the surface, then the brand gradient, and let
         the border box show only the second. */
      background-image: linear-gradient(var(--surface), var(--surface)),
        linear-gradient(135deg, ${$dark ? BRAND.dark.from : BRAND.light.from},
          ${$dark ? BRAND.dark.to : BRAND.light.to});
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

const PlanName = styled.div`
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 4px;
`;

const PlanTagline = styled.div`
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
  svg { flex: 0 0 auto; margin-top: 2px; color: ${({ theme }) => theme.colors.primary}; }
`;

const PlanCta = styled.a<{ $featured: boolean; $dark: boolean }>`
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
  &:hover { opacity: 0.9; }
`;

const ContactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  max-width: 760px;
  margin: 0 auto;
`;

const ContactCard = styled.div`
  padding: 24px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  text-align: center;
`;

const ContactLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const ContactValue = styled.a`
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const Socials = styled.div`
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
`;

const Social = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { color: ${({ theme }) => theme.colors.primary}; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 28px 24px;
  margin-top: 40px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const FooterLinks = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  a { color: ${({ theme }) => theme.colors.primary}; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
`;

const SOCIAL_ICONS: Record<string, typeof Send> = {
  telegram: Send,
  instagram: Instagram,
  facebook: Facebook,
};

const FEATURES: Array<{ icon: typeof WifiOff; t: StringKey; d: StringKey }> = [
  { icon: WifiOff, t: 'features.offline.t', d: 'features.offline.d' },
  { icon: Receipt, t: 'features.fiscal.t', d: 'features.fiscal.d' },
  { icon: ShieldCheck, t: 'features.marking.t', d: 'features.marking.d' },
  { icon: Printer, t: 'features.hardware.t', d: 'features.hardware.d' },
  { icon: Network, t: 'features.multi.t', d: 'features.multi.d' },
  { icon: LineChart, t: 'features.dashboard.t', d: 'features.dashboard.d' },
];

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    /* ignore */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Never throws and never returns undefined — the caller keeps what is already on screen. */
async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`https://api.posgro.uz/api${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [dark, setDark] = useState<boolean>(initialDark);
  const [plans, setPlans] = useState<LandingPlan[]>(FALLBACK_PLANS);
  const [prices, setPrices] = useState<Prices>(FALLBACK_PRICES);
  const [contact, setContact] = useState<LandingContact>(FALLBACK_CONTACT);

  const t = (key: StringKey) => translate(lang, key);
  const ru = lang === 'ru';

  useEffect(() => {
    document.documentElement.lang = lang;
    saveLang(lang);
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* the page works fine without remembering */
    }
  }, [dark]);

  useEffect(() => {
    // Live content replaces the baked copy when it arrives. A failure leaves what is rendered.
    getJson('/site-config/landing-plans', FALLBACK_PLANS).then((p) => p.length && setPlans(p));
    getJson('/site-config/subscription-plans', FALLBACK_PRICES).then(setPrices);
    getJson('/site-config/landing-contact', FALLBACK_CONTACT).then(setContact);
  }, []);

  const theme: Theme = dark ? darkTheme : lightTheme;
  const telegram = contact.socials.find((s) => s.platform === 'telegram')?.url;
  /** An empty ctaUrl falls back to Telegram — one link to change, not three. */
  const planHref = (p: LandingPlan) => p.ctaUrl || telegram || DASHBOARD_URL;

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {/* --surface feeds the featured card's gradient border, which needs the solid colour twice. */}
      <div style={{ ['--surface' as string]: theme.colors.surface }}>
        <Bar>
          <Brand href="/">
            <Mark $dark={dark}>PG</Mark>
            POSGRO
          </Brand>
          <NavLink href="#features">{t('nav.features')}</NavLink>
          <NavLink href="#pricing">{t('nav.pricing')}</NavLink>
          <NavLink href="#contact">{t('nav.contact')}</NavLink>
          <IconBtn onClick={() => setLang(ru ? 'uz' : 'ru')} title={t('lang.toggle')}>
            {ru ? 'RU' : 'UZ'}
          </IconBtn>
          <IconBtn onClick={() => setDark(!dark)} title={t('theme.toggle')}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </IconBtn>
          <LoginBtn $dark={dark} href={DASHBOARD_URL}>
            <LogIn size={15} />
            {t('nav.login')}
          </LoginBtn>
        </Bar>

        <Main>
          <Hero>
            <H1>
              <Accent $dark={dark}>POSGRO</Accent> — {t('hero.title')}
            </H1>
            <Lede>{t('hero.lede')}</Lede>
            <CtaRow>
              <PrimaryCta $dark={dark} href={DASHBOARD_URL}>
                <LogIn size={18} />
                {t('hero.cta')}
              </PrimaryCta>
              <SecondaryCta href={PANEL_URL}>
                <Download size={18} />
                {t('hero.download')}
              </SecondaryCta>
            </CtaRow>
          </Hero>

          <Section id="features">
            <SectionTitle>{t('features.title')}</SectionTitle>
            <SectionLede />
            <FeatureGrid>
              {FEATURES.map(({ icon: Icon, t: title, d }) => (
                <Feature key={title}>
                  <FeatureIcon $dark={dark}>
                    <Icon size={21} />
                  </FeatureIcon>
                  <FeatureTitle>{t(title)}</FeatureTitle>
                  <FeatureText>{t(d)}</FeatureText>
                </Feature>
              ))}
            </FeatureGrid>
          </Section>

          <Section id="pricing">
            <SectionTitle>{t('pricing.title')}</SectionTitle>
            <SectionLede>{t('pricing.lede')}</SectionLede>
            <PriceGrid>
              {plans.map((plan) => {
                const price = prices[plan.id] ?? 0;
                const features = ru ? plan.featuresRu : plan.featuresUz;
                return (
                  <PlanCard key={plan.id} $featured={plan.highlighted} $dark={dark}>
                    {plan.highlighted && <Badge $dark={dark}>{t('pricing.popular')}</Badge>}
                    <PlanName>{(ru ? plan.nameRu : plan.nameUz) || plan.id}</PlanName>
                    <PlanTagline>{ru ? plan.taglineRu : plan.taglineUz}</PlanTagline>
                    <Price>
                      {formatPrice(price)}
                      <PriceUnit>
                        {t('pricing.sum')}
                        {plan.id === 'vip' ? ` ${t('pricing.once')}` : t('pricing.month')}
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
                    <PlanCta $featured={plan.highlighted} $dark={dark} href={planHref(plan)}>
                      {t('pricing.cta')}
                    </PlanCta>
                  </PlanCard>
                );
              })}
            </PriceGrid>
          </Section>

          <Section id="contact">
            <SectionTitle>{t('contact.title')}</SectionTitle>
            <SectionLede>{t('contact.lede')}</SectionLede>
            <ContactGrid>
              {contact.phones.map((p, i) => (
                <ContactCard key={i}>
                  <ContactLabel>
                    <Phone size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                    {p.label || t('contact.phone')}
                  </ContactLabel>
                  {/* tel: needs the digits, the page shows the readable form */}
                  <ContactValue href={`tel:${p.number.replace(/[^\d+]/g, '')}`}>
                    {p.number}
                  </ContactValue>
                </ContactCard>
              ))}
              {(ru ? contact.workingHoursRu : contact.workingHoursUz) && (
                <ContactCard>
                  <ContactLabel>
                    <Clock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                    {t('contact.hours')}
                  </ContactLabel>
                  <ContactValue as="div">
                    {ru ? contact.workingHoursRu : contact.workingHoursUz}
                  </ContactValue>
                </ContactCard>
              )}
            </ContactGrid>

            {contact.socials.length > 0 && (
              <Socials>
                {contact.socials.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform] ?? LinkIcon;
                  return (
                    <Social
                      key={s.platform + s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={s.platform}
                      aria-label={s.platform}
                    >
                      <Icon size={20} />
                    </Social>
                  );
                })}
              </Socials>
            )}
          </Section>
        </Main>

        <Footer>
          <FooterLinks>
            <a href={DASHBOARD_URL}>{t('footer.dashboard')}</a>
            <a href={PANEL_URL}>{t('footer.download')}</a>
            {telegram && (
              <a href={telegram} target="_blank" rel="noreferrer noopener">
                {t('contact.write')}
              </a>
            )}
          </FooterLinks>
          © {new Date().getFullYear()} POSGRO. {t('footer.rights')}
        </Footer>
      </div>
    </ThemeProvider>
  );
}
