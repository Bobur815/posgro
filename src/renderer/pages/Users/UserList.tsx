import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Table } from '../../components/common/Table';
import { Button } from '../../components/common/Button';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Badge = styled.span<{ $active?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.success : theme.colors.error};
  color: white;
`;

const RoleBadge = styled.span<{ $role: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $role }) =>
    $role === 'ADMIN' ? theme.colors.primary : theme.colors.secondary};
  color: white;
`;

interface User {
  id: string;
  username: string;
  nameRu: string;
  nameUz: string;
  role: 'ADMIN' | 'USER';
  active: boolean;
  createdAt: string;
}

export function UserList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await window.electronAPI.users.getAll();
      setUsers(data as User[]);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await window.electronAPI.users.update(user.id, { active: !user.active });
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const columns = [
    { key: 'username', header: t('users.username') },
    {
      key: 'name',
      header: t('users.name'),
      render: (user: User) => (i18n.language === 'uz' ? user.nameUz : user.nameRu),
    },
    {
      key: 'role',
      header: t('users.role'),
      render: (user: User) => (
        <RoleBadge $role={user.role}>
          {user.role === 'ADMIN' ? t('users.admin') : t('users.cashier')}
        </RoleBadge>
      ),
    },
    {
      key: 'active',
      header: t('users.status'),
      render: (user: User) => (
        <Badge $active={user.active}>
          {user.active ? t('users.active') : t('users.inactive')}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('users.createdAt'),
      render: (user: User) => new Date(user.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (user: User) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="small"
            variant="secondary"
            onClick={() => navigate(`/users/${user.id}/edit`)}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant={user.active ? 'danger' : 'primary'}
            onClick={() => handleToggleActive(user)}
          >
            {user.active ? t('users.deactivate') : t('users.activate')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title>{t('users.title')}</Title>
        <Button onClick={() => navigate('/users/new')}>{t('users.addUser')}</Button>
      </Header>

      <Table
        columns={columns}
        data={users}
        loading={isLoading}
        emptyMessage={t('users.noUsers')}
      />
    </Container>
  );
}
