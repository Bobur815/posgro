import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Sidebar } from './Sidebar';
import { AppBar, APP_BAR_HEIGHT } from './AppBar';
import { SidebarProvider } from '../../context/SidebarContext';

const Content = styled.main`
  padding-top: ${APP_BAR_HEIGHT + 8}px;
  padding-left: ${({ theme }) => theme.spacing.sm};
  padding-right: ${({ theme }) => theme.spacing.sm};
  padding-bottom: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  min-height: 100vh;
  overflow-y: auto;
  min-width: 0;
`;

export function Layout() {
  return (
    <SidebarProvider>
      <AppBar />
      <Sidebar />
      <Content>
        <Outlet />
      </Content>
    </SidebarProvider>
  );
}
