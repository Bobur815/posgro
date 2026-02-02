import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

const Container = styled.div`
  display: flex;
  min-height: 100vh;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const Content = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.background};
  overflow-y: auto;
`;

export function Layout() {
  return (
    <Container>
      <Sidebar />
      <MainContent>
        <Header />
        <Content>
          <Outlet />
        </Content>
      </MainContent>
    </Container>
  );
}
