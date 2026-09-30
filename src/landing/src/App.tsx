import React, { useEffect } from "react";
import styled, { ThemeProvider } from "styled-components";
import { lightTheme as theme } from "@theme/themes";
import { LandingProvider } from "./context/LandingContext";
import { useSiteContent } from "./hooks/useSiteContent";
import { GlobalStyle } from "./styles/GlobalStyle";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { Hero } from "./components/sections/Hero";
import { Features } from "./components/sections/Features";
import { Pricing } from "./components/sections/Pricing";
import { Contact } from "./components/sections/Contact";
import { NewsListPage } from "./pages/NewsListPage";
import { NewsArticlePage } from "./pages/NewsArticlePage";
import { matchRoute, usePathname } from "./router";

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

const Main = styled.main`
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 24px;
`;

function Page() {
  const { plans, prices, contact, telegram, heroVideo } = useSiteContent();
  const route = matchRoute(usePathname());

  // "/#pricing" from a news page is a fresh load: the browser looks for the anchor before React has
  // rendered the sections, so scroll once they exist.
  useEffect(() => {
    if (route.page !== "home" || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [route.page]);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {/* --surface feeds the featured card's gradient border, which needs the solid colour twice. */}
      <div style={{ ["--surface" as string]: theme.colors.surface }}>
        <Header />
        {route.page === "home" && <Hero video={heroVideo} />}
        <Main>
          {route.page === "home" && (
            <>
              <Features />
              <Pricing plans={plans} prices={prices} telegram={telegram} />
              <Contact contact={contact} />
            </>
          )}
          {route.page === "news" && <NewsListPage />}
          {route.page === "article" && <NewsArticlePage slug={route.slug} />}
        </Main>
        <Footer telegram={telegram} />
      </div>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <LandingProvider>
      <Page />
    </LandingProvider>
  );
}
