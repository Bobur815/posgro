import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from '../../context/SidebarContext';

const Container = styled.div`
  min-height: 100vh;
`;

const Content = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  overflow-y: auto;
  min-width: 0;
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
