import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from '../../context/SidebarContext';

const Container = styled.div`
  display: flex;
  min-height: 100vh;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* Prevents flex item from overflowing */
  transition: margin-left 0.3s ease;
`;

const Content = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.background};
  overflow-y: auto;
`;

export function Layout() {
  return (
    <SidebarProvider>
      <Container>
        <Sidebar />
        <MainContent>
          <Header />
          <Content>
            <Outlet />
          </Content>
        </MainContent>
      </Container>
    </SidebarProvider>
  );
}
