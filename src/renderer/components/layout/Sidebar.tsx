import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
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
  LogOut,
  ChevronLeft,
  ChevronRight,
  Truck,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../../store/auth-store";
import { useSidebar } from "../../context/SidebarContext";
import { useSync } from "../../hooks/useSync";

const SIDEBAR_WIDTH = 220;
const MINI_SIDEBAR_WIDTH = 70;

const Container = styled.aside<{ $collapsed: boolean }>`
  width: ${({ $collapsed }) =>
    $collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH}px;
  min-width: ${({ $collapsed }) =>
    $collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  transition:
    width 0.3s ease,
    min-width 0.3s ease;
  overflow: hidden;
`;

const LogoSection = styled.div<{ $collapsed: boolean }>`
  padding: ${({ theme }) => theme.spacing.lg};
  padding-right: ${({ theme, $collapsed }) =>
    $collapsed ? theme.spacing.lg : theme.spacing.sm};
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "space-between"};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: 60px;
  position: relative;
`;

const Logo = styled.div<{ $collapsed: boolean }>`
  font-size: ${({ $collapsed }) => ($collapsed ? "16px" : "20px")};
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
  margin-bottom: ${({ $collapsed }) => ($collapsed ? "0" : "8px")};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
  overflow: hidden;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  max-height: ${({ $collapsed }) => ($collapsed ? "0" : "20px")};
  transition:
    opacity 0.2s ease,
    max-height 0.3s ease,
    margin-bottom 0.3s ease;
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
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "flex-start"};

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
  max-width: ${({ $collapsed }) => ($collapsed ? "0" : "180px")};
  transition:
    opacity 0.2s ease,
    max-width 0.3s ease;
`;

const BottomSection = styled.div<{ $collapsed: boolean }>`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SyncStatus = styled.div<{ $syncing?: boolean; $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "flex-start")};
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 11px;
  color: ${({ theme, $syncing }) =>
    $syncing ? theme.colors.warning : theme.colors.success};
  padding: 0 ${({ theme }) => theme.spacing.sm};
`;

const SyncText = styled.span<{ $collapsed: boolean }>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  max-width: ${({ $collapsed }) => ($collapsed ? "0" : "180px")};
  transition: opacity 0.2s ease, max-width 0.3s ease;
`;

const UserSection = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "flex-start")};
`;

const UserName = styled.span`
  font-weight: 500;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserRole = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background-color: ${({ theme }) => theme.colors.primary}20;
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
`;

const UserDetails = styled.div<{ $collapsed: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  max-width: ${({ $collapsed }) => ($collapsed ? "0" : "180px")};
  transition: opacity 0.2s ease, max-width 0.3s ease;
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

const LogoutButton = styled.button<{ $collapsed: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  transition: all 0.2s;
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "flex-start")};

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}10;
  }
`;

const Tooltip = styled.span`
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isPinLogin, logout } = useAuthStore();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { status } = useSync();
  const isAdmin = user?.role === "ADMIN";

  const handleLogin = async () => {
    await logout();
    navigate("/login");
  };

  const handleLogout = async () => {
    await logout();
  };

  const getUserName = () => {
    if (!user) return "";
    return i18n.language === "uz" ? user.nameUz : user.nameRu;
  };

  const renderNavItem = (
    to: string,
    IconComponent: LucideIcon,
    label: string,
    end?: boolean,
  ) => (
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
          {isCollapsed ? "POS" : "Grocery POS"}
        </Logo>
        <ToggleButton
          onClick={toggleSidebar}
          title={isCollapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </ToggleButton>
      </LogoSection>

      <Nav>
        <NavSection>
          <SectionTitle $collapsed={isCollapsed}>{t("nav.main")}</SectionTitle>
          {renderNavItem("/", ShoppingCart, t("nav.pos"), true)}
          {renderNavItem("/products", Package, t("nav.products"))}
        </NavSection>

        <NavSection>
          <SectionTitle $collapsed={isCollapsed}>
            {t("nav.reports")}
          </SectionTitle>
          {renderNavItem("/reports/daily", BarChart3, t("nav.dailySummary"))}
          {isAdmin && (
            <>
              {renderNavItem(
                "/reports/monthly",
                TrendingUp,
                t("nav.monthlyReport"),
              )}
              {renderNavItem(
                "/reports/analytics",
                LineChart,
                t("nav.analytics"),
              )}
            </>
          )}
        </NavSection>

        {isAdmin && (
          <NavSection>
            <SectionTitle $collapsed={isCollapsed}>
              {t("nav.management")}
            </SectionTitle>
            {renderNavItem(
              "/products/stock",
              ClipboardList,
              t("nav.inventory"),
            )}
            {renderNavItem("/inventory/weighed", Scale, t("inventory.preWeighed"))}
            {renderNavItem("/suppliers", Truck, t("suppliers.title"))}
            {renderNavItem("/users", Users, t("nav.users"))}
            {renderNavItem("/settings", Settings, t("nav.settings"))}
          </NavSection>
        )}

        {!isAdmin && (
          <NavSection>
            <SectionTitle $collapsed={isCollapsed}>
              {t("nav.settings")}
            </SectionTitle>
            {renderNavItem("/settings/user", User, t("nav.userSettings"))}
          </NavSection>
        )}
      </Nav>

      <BottomSection $collapsed={isCollapsed}>
        <SyncStatus $syncing={status.isSyncing} $collapsed={isCollapsed}>
          <span>{status.isSyncing ? "🔄" : "✓"}</span>
          <SyncText $collapsed={isCollapsed}>
            {status.isSyncing
              ? t("sync.syncing")
              : status.lastSyncTime
              ? `${t("sync.lastSync")}: ${new Date(status.lastSyncTime).toLocaleTimeString()}`
              : t("sync.notSynced")}
          </SyncText>
        </SyncStatus>

        {isPinLogin ? (
          <NavItemWrapper>
            <LoginButton $collapsed={isCollapsed} onClick={handleLogin}>
              <IconWrapper>
                <LogIn size={20} />
              </IconWrapper>
              <NavText $collapsed={isCollapsed}>{t("auth.login")}</NavText>
            </LoginButton>
            {isCollapsed && <Tooltip>{t("auth.login")}</Tooltip>}
          </NavItemWrapper>
        ) : (
          <>
            {user && (
              <NavItemWrapper>
                <UserSection $collapsed={isCollapsed}>
                  <IconWrapper>
                    <User size={18} />
                  </IconWrapper>
                  <UserDetails $collapsed={isCollapsed}>
                    <UserName>{getUserName()}</UserName>
                    <UserRole>
                      {user.role === "ADMIN" ? t("users.admin") : t("users.cashier")}
                    </UserRole>
                  </UserDetails>
                </UserSection>
                {isCollapsed && <Tooltip>{getUserName()}</Tooltip>}
              </NavItemWrapper>
            )}
            <NavItemWrapper>
              <LogoutButton $collapsed={isCollapsed} onClick={handleLogout}>
                <IconWrapper>
                  <LogOut size={18} />
                </IconWrapper>
                <NavText $collapsed={isCollapsed}>{t("auth.logout")}</NavText>
              </LogoutButton>
              {isCollapsed && <Tooltip>{t("auth.logout")}</Tooltip>}
            </NavItemWrapper>
          </>
        )}
      </BottomSection>
    </Container>
  );
}
