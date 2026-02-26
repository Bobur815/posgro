import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from '@context/SidebarContext';

const Container = styled.div`
  display: flex;
  min-height: 100vh;
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
        <Content>
          <Outlet />
        </Content>
      </Container>
    </SidebarProvider>
  );
}
