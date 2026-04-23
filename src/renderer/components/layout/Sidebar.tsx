import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import {
  ShoppingCart,
  Package,
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
  type LucideIcon,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import { useAuthStore } from "../../store/auth-store";
import { useSidebar } from "../../context/SidebarContext";
import { useSync } from "../../hooks/useSync";

const SIDEBAR_WIDTH = 240;

const Backdrop = styled.div<{ $visible: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 99;
  background: rgba(0, 0, 0, 0.4);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  transition: opacity 0.25s ease;
`;

// Fixed shell — always occupies left edge, out of layout flow
const Container = styled.aside`
  position: fixed;
  left: 0;
  top: 0;
  height: 100%;
  width: ${SIDEBAR_WIDTH}px;
  z-index: 100;
  pointer-events: none;
  overflow: visible;
`;

// Drawer panel — slides in/out via transform
const SidebarInner = styled.div<{ $collapsed: boolean }>`
  width: ${SIDEBAR_WIDTH}px;
  height: 100%;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  transform: translateX(${({ $collapsed }) => ($collapsed ? "-100%" : "0")});
  transition: transform 0.25s ease;
  box-shadow: ${({ $collapsed }) =>
    $collapsed ? "none" : "4px 0 24px rgba(0,0,0,0.18)"};
`;

// Tab that sticks out from the right edge of the drawer
const ToggleTab = styled.button<{$collapsed: boolean}>`
  position: absolute;
  right: ${({ $collapsed }) => ($collapsed ? "215px" : "-26px")};
  top: 5px;
  width: 26px;
  height: 52px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: none;
  border-radius: 0 8px 8px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  box-shadow: 3px 0 8px rgba(0, 0, 0, 0.08);
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}12;
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary}60;
  }
`;

const LogoSection = styled.div`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: 56px;
`;

const Logo = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
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

const SectionTitle = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  margin-bottom: 6px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
  letter-spacing: 0.05em;
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

const IconWrapper = styled.span`
  flex-shrink: 0;
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NavText = styled.span`
  white-space: nowrap;
  font-size: 15px;
`;

const BottomSection = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SyncStatus = styled.div<{ $syncing?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 11px;
  color: ${({ theme, $syncing }) =>
    $syncing ? theme.colors.warning : theme.colors.success};
  padding: 0 ${({ theme }) => theme.spacing.sm};
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SyncButton = styled.button<{ $syncing?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: ${({ $syncing }) => ($syncing ? "default" : "pointer")};
  flex-shrink: 0;
  margin-left: auto;
  transition: color 0.2s, transform 0.1s;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.primary};
  }

  &:active:not(:disabled) {
    transform: scale(0.85);
  }

  svg {
    animation: ${({ $syncing }) => ($syncing ? spin : "none")} 1s linear infinite;
  }
`;

const SyncText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
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

const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  min-width: 0;
`;

const LoginButton = styled.button`
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

const LogoutButton = styled.button`
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

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}10;
  }
`;

const UpdateDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.colors.error};
  margin-left: auto;
  flex-shrink: 0;
`;

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isPinLogin, logout } = useAuthStore();
  const { isCollapsed, toggleSidebar, collapseSidebar } = useSidebar();
  const { status, refreshStatus } = useSync();
  const isAdmin = user?.role === "ADMIN";
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.updater) return;
    const unsub = window.electronAPI.updater.onAvailable(() => setUpdateAvailable(true));
    return unsub;
  }, []);

  const handleLogin = async () => {
    await logout();
    navigate("/login");
  };

  const handleSyncNow = async () => {
    try {
      await window.electronAPI.sync.trigger();
      await refreshStatus();
    } catch (err) {
      console.error("Sync failed:", err);
    }
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
    <StyledNavLink to={to} end={end} onClick={collapseSidebar}>
      <IconWrapper>
        <IconComponent size={17} />
      </IconWrapper>
      <NavText>{label}</NavText>
    </StyledNavLink>
  );

  return (
    <>
      <Backdrop $visible={!isCollapsed} onClick={collapseSidebar} />
      <Container>
      {/* Toggle tab — always visible regardless of collapsed state */}
      <ToggleTab $collapsed={isCollapsed}
        onClick={toggleSidebar}
        title={isCollapsed ? t("nav.expand") : t("nav.collapse")}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </ToggleTab>

      <SidebarInner $collapsed={isCollapsed}>
        <LogoSection>
          <Logo>Yangi Asr</Logo>
        </LogoSection>

        <Nav>
          <NavSection>
            <SectionTitle>{t("nav.main")}</SectionTitle>
            {renderNavItem("/", ShoppingCart, t("nav.pos"), true)}
            {renderNavItem("/products", Package, t("nav.products"))}
          </NavSection>

          <NavSection>
            <SectionTitle>{t("nav.reports")}</SectionTitle>
            {renderNavItem("/reports/daily", ReceiptText, t("nav.receipts"))}
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
              <SectionTitle>{t("nav.management")}</SectionTitle>
              {renderNavItem(
                "/products/stock",
                ClipboardList,
                t("nav.inventory"),
              )}
              {renderNavItem("/suppliers", Truck, t("suppliers.title"))}
              {renderNavItem("/users", Users, t("nav.users"))}
              <StyledNavLink to="/settings" onClick={collapseSidebar}>
                <IconWrapper><Settings size={17} /></IconWrapper>
                <NavText>{t("nav.settings")}</NavText>
                {updateAvailable && <UpdateDot />}
              </StyledNavLink>
            </NavSection>
          )}

          {!isAdmin && (
            <NavSection>
              <SectionTitle>{t("nav.settings")}</SectionTitle>
              {renderNavItem("/settings/user", User, t("nav.userSettings"))}
            </NavSection>
          )}
        </Nav>

        <BottomSection>
          <SyncStatus $syncing={status.isSyncing}>
            <span>{status.isSyncing ? "🔄" : "✓"}</span>
            <SyncText>
              {status.isSyncing
                ? t("sync.syncing")
                : status.lastSyncTime
                  ? `${t("sync.lastSync")}: ${new Date(status.lastSyncTime).toLocaleTimeString()}`
                  : t("sync.notSynced")}
            </SyncText>
            <SyncButton
              $syncing={status.isSyncing}
              disabled={status.isSyncing}
              onClick={handleSyncNow}
              title={t("settings.syncNow")}
            >
              <RefreshCw size={15} />
            </SyncButton>
          </SyncStatus>

          {isPinLogin ? (
            <LoginButton onClick={handleLogin}>
              <IconWrapper>
                <LogIn size={17} />
              </IconWrapper>
              <NavText>{t("auth.login")}</NavText>
            </LoginButton>
          ) : (
            <>
              {user && (
                <UserSection>
                  <IconWrapper>
                    <User size={17} />
                  </IconWrapper>
                  <UserDetails>
                    <UserName>{getUserName()}</UserName>
                    <UserRole>
                      {user.role === "ADMIN"
                        ? t("users.admin")
                        : t("users.cashier")}
                    </UserRole>
                  </UserDetails>
                </UserSection>
              )}
              <LogoutButton onClick={handleLogout}>
                <IconWrapper>
                  <LogOut size={17} />
                </IconWrapper>
                <NavText>{t("auth.logout")}</NavText>
              </LogoutButton>
            </>
          )}
        </BottomSection>
      </SidebarInner>
    </Container>
    </>
  );
}
