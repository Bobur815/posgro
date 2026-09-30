import React from "react";
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

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {/* --surface feeds the featured card's gradient border, which needs the solid colour twice. */}
      <div style={{ ["--surface" as string]: theme.colors.surface }}>
        <Header />
        <Hero video={heroVideo} />
        <Main>
          <Features />
          <Pricing plans={plans} prices={prices} telegram={telegram} />
          <Contact contact={contact} />
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
