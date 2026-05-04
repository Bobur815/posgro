import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { Menu, X, RefreshCw, LogIn, LogOut, User } from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';
import { useAuthStore } from '../../store/auth-store';
import { useSync } from '../../hooks/useSync';
import { POSGROIcon } from '../../branding';
import { useTheme } from '../../theme/ThemeProvider';

export const APP_BAR_HEIGHT = 48;

// ─── Styled ───────────────────────────────────────────────────────────────────

const Bar = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: ${APP_BAR_HEIGHT}px;
  z-index: 200;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.primary};
  }

  &:active {
    transform: scale(0.9);
  }
`;

const BrandWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const BrandName = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
  letter-spacing: 0.5px;
`;

const Spacer = styled.div`
  flex: 1;
`;

const SmenaIndicator = styled.div<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: ${({ $open, theme }) =>
    $open ? theme.colors.success + '20' : theme.colors.error + '18'};
  border: 1px solid ${({ $open, theme }) =>
    $open ? theme.colors.success + '60' : theme.colors.error + '40'};
  font-size: 12px;
  font-weight: 600;
  color: ${({ $open, theme }) =>
    $open ? theme.colors.success : theme.colors.error};
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
  &:hover { opacity: 0.8; }
`;

const Dot = styled.span<{ $open: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $open, theme }) =>
    $open ? theme.colors.success : theme.colors.error};
  flex-shrink: 0;
`;

const Divider = styled.div`
  width: 1px;
  height: 24px;
  background: ${({ theme }) => theme.colors.border};
  flex-shrink: 0;
`;

const UserChip = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const UserName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
`;

const RoleBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primary}20;
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SyncBtn = styled(IconBtn)<{ $syncing?: boolean }>`
  color: ${({ $syncing, theme }) =>
    $syncing ? theme.colors.warning : theme.colors.textSecondary};

  svg {
    animation: ${({ $syncing }) => ($syncing ? spin : 'none')} 1s linear infinite;
  }
`;

const LoginBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function AppBar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isCollapsed, toggleSidebar, openSmenaModal } = useSidebar();
  const { user, isPinLogin, logout } = useAuthStore();
  const { status, refreshStatus } = useSync();
  const { mode } = useTheme();

  const [smenaOpen, setSmenaOpen] = useState<boolean | null>(null);

  const checkSmena = useCallback(async () => {
    if (!window.electronAPI?.smena) return;
    try {
      const s = await window.electronAPI.smena.getCurrent();
      setSmenaOpen(s != null);
    } catch {
      setSmenaOpen(null);
    }
  }, []);

  useEffect(() => {
    checkSmena();
    window.addEventListener('focus', checkSmena);
    window.addEventListener('smena-updated', checkSmena);
    return () => {
      window.removeEventListener('focus', checkSmena);
      window.removeEventListener('smena-updated', checkSmena);
    };
  }, [checkSmena]);

  const handleSync = async () => {
    try {
      await window.electronAPI.sync.trigger();
      await refreshStatus();
      // Soft-refresh: dispatch the stock-updated event that data hooks listen to
      window.dispatchEvent(new Event('stock-updated'));
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const handleLogin = async () => {
    await logout();
    navigate('/login');
  };

  const handleLogout = async () => {
    await logout();
  };

  const userName = user
    ? (i18n.language === 'uz' ? user.nameUz : user.nameRu)
    : '';

  return (
    <Bar>
      {/* Hamburger / Close */}
      <IconBtn onClick={toggleSidebar} title={isCollapsed ? t('nav.expand') : t('nav.collapse')}>
        {isCollapsed ? <Menu size={20} /> : <X size={20} />}
      </IconBtn>

      {/* Brand */}
      <BrandWrapper>
        <POSGROIcon theme={mode} size={28} />
        <BrandName>POSGRO</BrandName>
      </BrandWrapper>

      <Spacer />

      {/* Smena indicator */}
      {smenaOpen !== null && (
        <SmenaIndicator $open={smenaOpen} onClick={openSmenaModal} title={t('smena.title')}>
          <Dot $open={smenaOpen} />
          {smenaOpen ? t('smena.statusOpen') : t('smena.statusClosed')}
        </SmenaIndicator>
      )}

      {/* Sync button */}
      <SyncBtn
        $syncing={status.isSyncing}
        onClick={handleSync}
        disabled={status.isSyncing}
        title={t('settings.syncNow')}
      >
        <RefreshCw size={17} />
      </SyncBtn>

      <Divider />

      {/* User section */}
      {isPinLogin ? (
        <LoginBtn onClick={handleLogin}>
          <LogIn size={14} />
          {t('auth.login')}
        </LoginBtn>
      ) : (
        <>
          {user && (
            <UserChip>
              <User size={15} style={{ color: 'inherit', opacity: 0.6 }} />
              <UserName>{userName}</UserName>
              <RoleBadge>
                {user.role === 'ADMIN' ? t('users.admin') : t('users.cashier')}
              </RoleBadge>
            </UserChip>
          )}
          <IconBtn onClick={handleLogout} title={t('auth.logout')}>
            <LogOut size={17} />
          </IconBtn>
        </>
      )}
    </Bar>
  );
}
