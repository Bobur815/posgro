import React, { useEffect, useMemo, useState } from 'react';
import styled, { ThemeProvider, createGlobalStyle } from 'styled-components';
import {
  Download,
  Moon,
  Sun,
  Printer,
  Scale,
  FileText,
  Package,
  ExternalLink,
} from 'lucide-react';
import { lightTheme, darkTheme, type Theme } from '@theme/themes';
import { translate, initialLang, saveLang, type Lang, type StringKey } from './i18n';
import {
  fetchLatestApp,
  fetchDownloads,
  formatSize,
  formatDate,
  type LatestApp,
  type DownloadItem,
} from './api';

/**
 * panel.posgro.uz — the public download portal.
 *
 * Two jobs: hand someone the current POSGRO installer, and hand them the drivers and manuals a
 * till needs. Nothing here requires a login, and nothing blocks on the API: if the backend is
 * unreachable the page still renders its shell, because the people who open it are often doing so
 * precisely because something is broken.
 */

const THEME_KEY = 'posgro-panel-theme';

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: background 0.2s ease, color 0.2s ease;
  }
  a { color: inherit; }
`;

const Shell = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const Brand = styled.a`
  font-weight: 800;
  font-size: 20px;
  letter-spacing: -0.02em;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};
  margin-right: auto;
`;

const BarBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 24px 64px;
`;

const Hero = styled.section`
  padding: 72px 0 56px;
  text-align: center;
`;

const H1 = styled.h1`
  margin: 0 0 16px;
  font-size: clamp(28px, 5vw, 44px);
  line-height: 1.15;
  letter-spacing: -0.02em;
`;

const Lede = styled.p`
  margin: 0 auto 32px;
  max-width: 620px;
  font-size: 17px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PrimaryBtn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  text-decoration: none;
  box-shadow: ${({ theme }) => theme.shadows.md};
  &:hover { opacity: 0.9; }
`;

const HeroMeta = styled.div`
  margin-top: 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Notice = styled.div`
  display: inline-block;
  padding: 14px 20px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const SectionTitle = styled.h2`
  margin: 48px 0 16px;
  font-size: 22px;
  letter-spacing: -0.01em;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`;

const Card = styled.a`
  display: flex;
  gap: 14px;
  padding: 20px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease, transform 0.15s ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    transform: translateY(-2px);
  }
`;

const CardIcon = styled.div`
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.primary};
  padding-top: 2px;
`;

const CardBody = styled.div`
  min-width: 0;
`;

const CardTitle = styled.div`
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
`;

const CardDesc = styled.div`
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

/** Size and version — the two facts that decide whether to start a download on a slow link. */
const CardMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Empty = styled.div`
  padding: 24px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const FooterLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${({ theme }) => theme.colors.primary};
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
`;

const CATEGORY_ORDER = ['DRIVER', 'TOOL', 'MANUAL', 'OTHER'] as const;

const CATEGORY_TITLE: Record<string, StringKey> = {
  DRIVER: 'section.drivers',
  TOOL: 'section.tools',
  MANUAL: 'section.manuals',
  OTHER: 'section.other',
};

const CATEGORY_ICON: Record<string, typeof Printer> = {
  DRIVER: Printer,
  TOOL: Scale,
  MANUAL: FileText,
  OTHER: Package,
};

/** Saved choice wins; otherwise follow the OS. Reads are wrapped — private windows can throw. */
function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    /* ignore */
  }
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [dark, setDark] = useState<boolean>(initialDark);
  const [app, setApp] = useState<LatestApp | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const t = (key: StringKey) => translate(lang, key);

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
    // Both settle regardless of outcome — the helpers swallow failures and return empty, so one
    // dead endpoint cannot leave the page stuck on "loading".
    Promise.all([fetchLatestApp(), fetchDownloads()]).then(([latest, list]) => {
      setApp(latest);
      setItems(list);
      setLoaded(true);
    });
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<string, DownloadItem[]>();
    for (const item of items) {
      const key = CATEGORY_ORDER.includes(item.category as never) ? item.category : 'OTHER';
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [items]);

  const theme: Theme = dark ? darkTheme : lightTheme;
  const title = (item: DownloadItem) => (lang === 'ru' ? item.titleRu : item.titleUz) || item.slug;
  const desc = (item: DownloadItem) => (lang === 'ru' ? item.descRu : item.descUz) || '';

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Shell>
        <Bar>
          <Brand href="/">POSGRO</Brand>
          <BarBtn
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            title={t('lang.toggle')}
            aria-label={t('lang.toggle')}
          >
            {lang === 'uz' ? 'UZ' : 'RU'}
          </BarBtn>
          <BarBtn
            onClick={() => setDark(!dark)}
            title={t('theme.toggle')}
            aria-label={t('theme.toggle')}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </BarBtn>
        </Bar>

        <Main>
          <Hero>
            <H1>{t('hero.title')}</H1>
            <Lede>{t('hero.subtitle')}</Lede>

            {/* Only one of three states, never a spinner over the button: the hero is the reason
                people are here, so it shows a real answer as soon as there is one. */}
            {!loaded ? (
              <Notice>{t('loading')}</Notice>
            ) : app ? (
              <>
                <PrimaryBtn href={app.url}>
                  <Download size={20} />
                  {t('hero.download')}
                </PrimaryBtn>
                <HeroMeta>
                  v{app.version} · {t('hero.windows')}
                  {formatSize(app.size) && ` · ${formatSize(app.size)}`}
                  {formatDate(app.releasedAt) && ` · ${t('hero.updated')} ${formatDate(app.releasedAt)}`}
                </HeroMeta>
              </>
            ) : (
              <Notice>{t('hero.unavailable')}</Notice>
            )}
          </Hero>

          {CATEGORY_ORDER.map((category) => {
            const list = byCategory.get(category) ?? [];
            // An empty category is simply absent — a marketing page full of "nothing here" boxes
            // reads as broken. The exception is DRIVER, whose heading anchors the nav link.
            if (!list.length && category !== 'DRIVER') return null;
            const Icon = CATEGORY_ICON[category];
            return (
              <section key={category} id={category.toLowerCase()}>
                <SectionTitle>{t(CATEGORY_TITLE[category])}</SectionTitle>
                {list.length ? (
                  <Grid>
                    {list.map((item) => (
                      <Card key={item.id} href={`/api/downloads/${item.slug}/get`}>
                        <CardIcon>
                          <Icon size={22} />
                        </CardIcon>
                        <CardBody>
                          <CardTitle>{title(item)}</CardTitle>
                          {desc(item) && <CardDesc>{desc(item)}</CardDesc>}
                          <CardMeta>
                            {item.version && `${t('card.version')} ${item.version} · `}
                            {formatSize(item.fileSize)}
                          </CardMeta>
                        </CardBody>
                      </Card>
                    ))}
                  </Grid>
                ) : (
                  loaded && <Empty>{t('section.empty')}</Empty>
                )}
              </section>
            );
          })}
        </Main>

        <Footer>
          <FooterLink href="https://web.posgro.uz/web/">
            {t('footer.dashboard')} <ExternalLink size={13} />
          </FooterLink>
          <div style={{ marginTop: 8 }}>
            © {new Date().getFullYear()} POSGRO. {t('footer.rights')}
          </div>
        </Footer>
      </Shell>
    </ThemeProvider>
  );
}
