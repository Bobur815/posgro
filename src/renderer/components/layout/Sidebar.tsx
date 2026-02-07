import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  ShoppingCart,
  Package,
  BarChart3,
  TrendingUp,
  LineChart,
  ClipboardList,
  Users,
  Settings,
  User,
  LogIn,
  ChevronLeft,
  ChevronRight,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { useSidebar } from '../../context/SidebarContext';

const SIDEBAR_WIDTH = 220;
const MINI_SIDEBAR_WIDTH = 70;

const Container = styled.aside<{ $collapsed: boolean }>`
  width: ${({ $collapsed }) => ($collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH)}px;
  min-width: ${({ $collapsed }) => ($collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH)}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, min-width 0.3s ease;
  overflow: hidden;
`;

const LogoSection = styled.div<{ $collapsed: boolean }>`
  padding: ${({ theme }) => theme.spacing.lg};
  padding-right: ${({ theme, $collapsed }) => ($collapsed ? theme.spacing.lg : theme.spacing.sm)};
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: 60px;
  position: relative;
`;

const Logo = styled.div<{ $collapsed: boolean }>`
  font-size: ${({ $collapsed }) => ($collapsed ? '16px' : '20px')};
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
  overflow: hidden;
`;

const ToggleButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
  overflow-x: hidden;
`;

const NavSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.div<{ $collapsed: boolean }>`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
  overflow: hidden;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  height: ${({ $collapsed }) => ($collapsed ? '0' : 'auto')};
  transition: opacity 0.2s ease, height 0.2s ease;
`;

const StyledNavLink = styled(NavLink)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  transition: all 0.2s;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  &.active {
    background-color: ${({ theme }) => theme.colors.primary}20;
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const IconWrapper = styled.span`
  flex-shrink: 0;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NavText = styled.span<{ $collapsed: boolean }>`
  white-space: nowrap;
  overflow: hidden;
  font-size: 18px;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  width: ${({ $collapsed }) => ($collapsed ? 0 : 'auto')};
  transition: opacity 0.2s ease, width 0.2s ease;
`;

const BottomSection = styled.div<{ $collapsed: boolean }>`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const LoginButton = styled.button<{ $collapsed: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Tooltip = styled.span`
  position: absolute;
  left: 100%;
  margin-left: 8px;
  padding: 4px 8px;
  background-color: ${({ theme }) => theme.colors.text};
  color: ${({ theme }) => theme.colors.surface};
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
`;

const NavItemWrapper = styled.div`
  position: relative;

  &:hover ${Tooltip} {
    opacity: 1;
  }
`;

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isPinLogin } = useAuthStore();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const isAdmin = user?.role === 'ADMIN';

  const handleLogin = () => {    
    navigate('/login');
  };

  const renderNavItem = (to: string, IconComponent: LucideIcon, label: string, end?: boolean) => (
    <NavItemWrapper>
      <StyledNavLink to={to} $collapsed={isCollapsed} end={end}>
        <IconWrapper>
          <IconComponent size={18} />
        </IconWrapper>
        <NavText $collapsed={isCollapsed}>{label}</NavText>
      </StyledNavLink>
      {isCollapsed && <Tooltip>{label}</Tooltip>}
    </NavItemWrapper>
  );

  return (
    <Container $collapsed={isCollapsed}>
      <LogoSection $collapsed={isCollapsed}>
        <Logo $collapsed={isCollapsed}>
          {isCollapsed ? 'POS' : 'Grocery POS'}
        </Logo>
        <ToggleButton onClick={toggleSidebar} title={isCollapsed ? t('nav.expand') : t('nav.collapse')}>
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </ToggleButton>
      </LogoSection>

      <Nav>
        <NavSection>
          <SectionTitle $collapsed={isCollapsed}>{t('nav.main')}</SectionTitle>
          {renderNavItem('/', ShoppingCart, t('nav.pos'), true)}
          {renderNavItem('/products', Package, t('nav.products'))}
        </NavSection>

        <NavSection>
          <SectionTitle $collapsed={isCollapsed}>{t('nav.reports')}</SectionTitle>
          {renderNavItem('/reports/daily', BarChart3, t('nav.dailySummary'))}
          {isAdmin && (
            <>
              {renderNavItem('/reports/monthly', TrendingUp, t('nav.monthlyReport'))}
              {renderNavItem('/reports/analytics', LineChart, t('nav.analytics'))}
            </>
          )}
        </NavSection>

        {isAdmin && (
          <NavSection>
            <SectionTitle $collapsed={isCollapsed}>{t('nav.management')}</SectionTitle>
            {renderNavItem('/products/stock', ClipboardList, t('nav.inventory'))}
            {renderNavItem('/suppliers', Truck, t('suppliers.title'))}
            {renderNavItem('/users', Users, t('nav.users'))}
            {renderNavItem('/settings', Settings, t('nav.settings'))}
          </NavSection>
        )}

        {!isAdmin && (
          <NavSection>
            <SectionTitle $collapsed={isCollapsed}>{t('nav.settings')}</SectionTitle>
            {renderNavItem('/settings/user', User, t('nav.userSettings'))}
          </NavSection>
        )}
      </Nav>

      {isPinLogin && (
        <BottomSection $collapsed={isCollapsed}>
          <NavItemWrapper>
            <LoginButton $collapsed={isCollapsed} onClick={handleLogin}>
              <IconWrapper>
                <LogIn size={24} />
              </IconWrapper>
              <NavText $collapsed={isCollapsed}>{t('auth.login')}</NavText>
            </LoginButton>
            {isCollapsed && <Tooltip>{t('auth.login')}</Tooltip>}
          </NavItemWrapper>
        </BottomSection>
      )}
    </Container>
  );
}
