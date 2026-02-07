import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useAuthStore } from '../../store/auth-store';
import { useSync } from '../../hooks/useSync';

const Container = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const MenuButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  padding: 4px 8px;
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

const SyncStatus = styled.div<{ $syncing?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 12px;
  color: ${({ theme, $syncing }) =>
    $syncing ? theme.colors.warning : theme.colors.success};
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const UserName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const UserRole = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background-color: ${({ theme }) => theme.colors.primary}20;
  padding: 2px 8px;
  border-radius: 12px;
`;

const LogoutButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

export function Header() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const { status } = useSync();

  const handleLogout = async () => {
    await logout();
  };

  const getUserName = () => {
    if (!user) return '';
    return i18n.language === 'uz' ? user.nameUz : user.nameRu;
  };

  return (
    <Container>
      <Left>
        <SyncStatus $syncing={status.isSyncing}>
          <span>{status.isSyncing ? '🔄' : '✓'}</span>
          <span>
            {status.isSyncing
              ? t('sync.syncing')
              : status.lastSyncTime
              ? `${t('sync.lastSync')}: ${new Date(status.lastSyncTime).toLocaleTimeString()}`
              : t('sync.notSynced')}
          </span>
        </SyncStatus>
      </Left>

      <Right>
        {user && (
          <UserInfo>
            <UserName>{getUserName()}</UserName>
            <UserRole>
              {user.role === 'ADMIN' ? t('users.admin') : t('users.cashier')}
            </UserRole>
          </UserInfo>
        )}
        <LogoutButton onClick={handleLogout}>{t('auth.logout')}</LogoutButton>
      </Right>
    </Container>
  );
}
