import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useAuthStore } from '../../store/auth-store';

const Container = styled.aside`
  width: 240px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
`;

const Logo = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  font-size: 20px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
`;

const NavSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  padding: 0 ${({ theme }) => theme.spacing.sm};
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  transition: all 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  &.active {
    background-color: ${({ theme }) => theme.colors.primary}20;
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Icon = styled.span`
  font-size: 18px;
`;

export function Sidebar() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Container>
      <Logo>Grocery POS</Logo>

      <Nav>
        <NavSection>
          <SectionTitle>{t('nav.main')}</SectionTitle>
          <StyledNavLink to="/" end>
            <Icon>🛒</Icon>
            {t('nav.pos')}
          </StyledNavLink>
          <StyledNavLink to="/products">
            <Icon>📦</Icon>
            {t('nav.products')}
          </StyledNavLink>
        </NavSection>

        <NavSection>
          <SectionTitle>{t('nav.reports')}</SectionTitle>
          <StyledNavLink to="/reports/daily">
            <Icon>📊</Icon>
            {t('nav.dailySummary')}
          </StyledNavLink>
          {isAdmin && (
            <>
              <StyledNavLink to="/reports/monthly">
                <Icon>📈</Icon>
                {t('nav.monthlyReport')}
              </StyledNavLink>
              <StyledNavLink to="/reports/analytics">
                <Icon>📉</Icon>
                {t('nav.analytics')}
              </StyledNavLink>
            </>
          )}
        </NavSection>

        {isAdmin && (
          <NavSection>
            <SectionTitle>{t('nav.management')}</SectionTitle>
            <StyledNavLink to="/products/stock">
              <Icon>📋</Icon>
              {t('nav.inventory')}
            </StyledNavLink>
            <StyledNavLink to="/users">
              <Icon>👥</Icon>
              {t('nav.users')}
            </StyledNavLink>
            <StyledNavLink to="/settings">
              <Icon>⚙️</Icon>
              {t('nav.settings')}
            </StyledNavLink>
          </NavSection>
        )}

        {!isAdmin && (
          <NavSection>
            <SectionTitle>{t('nav.settings')}</SectionTitle>
            <StyledNavLink to="/settings/user">
              <Icon>👤</Icon>
              {t('nav.userSettings')}
            </StyledNavLink>
          </NavSection>
        )}
      </Nav>
    </Container>
  );
}
