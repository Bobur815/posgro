import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SubscriptionBanner } from './SubscriptionBanner';
import { SidebarProvider } from '@context/SidebarContext';

const Container = styled.div`
  display: flex;
  min-height: 100vh;
`;

/** The top bar over the page, beside the sidebar. */
const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const Content = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  overflow-y: auto;
  min-width: 0;

  /* Mobile: add bottom padding for the fixed bottom nav bar */
  @media (max-width: 767px) {
    padding-bottom: calc(${({ theme }) => theme.spacing.sm} + 60px + env(safe-area-inset-bottom, 0px));
  }
`;

export function Layout() {
  return (
    <SidebarProvider>
      <Container>
        <Sidebar />
        <Main>
          <TopBar />
          <SubscriptionBanner />
          <Content>
            <Outlet />
          </Content>
        </Main>
      </Container>
    </SidebarProvider>
  );
}
