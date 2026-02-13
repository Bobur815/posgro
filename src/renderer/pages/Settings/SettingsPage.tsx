import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const SettingsCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const CardIcon = styled.div`
  font-size: 32px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const CardTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.text};
`;

const CardDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const settingsSections = [
    {
      icon: '👤',
      title: t('settings.userSettings'),
      description: t('settings.userSettingsDescription'),
      path: '/settings/user',
    },
    {
      icon: '⚙️',
      title: t('settings.systemSettings'),
      description: t('settings.systemSettingsDescription'),
      path: '/settings/system',
    },
    {
      icon: '🖨️',
      title: t('settings.printerSettings'),
      description: t('settings.printerSettingsDescription'),
      path: '/settings/printer',
    },
    {
      icon: '🧾',
      title: t('receipt.title'),
      description: t('receipt.description'),
      path: '/settings/receipt',
    },
    {
      icon: '🔄',
      title: t('settings.syncSettings'),
      description: t('settings.syncSettingsDescription'),
      path: '/settings/sync',
    },
    {
      icon: '🏷️',
      title: t('priceTags.title'),
      description: t('priceTags.settingsDescription'),
      path: '/settings/price-tags',
    },
    {
      icon: '👥',
      title: t('settings.userManagement'),
      description: t('settings.userManagementDescription'),
      path: '/users',
    },
    {
      icon: '📦',
      title: t('settings.inventorySettings'),
      description: t('settings.inventorySettingsDescription'),
      path: '/products/stock',
    },
  ];

  return (
    <Container>
      <Title>{t('settings.title')}</Title>

      <SettingsGrid>
        {settingsSections.map((section) => (
          <SettingsCard key={section.path} onClick={() => navigate(section.path)}>
            <CardIcon>{section.icon}</CardIcon>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </SettingsCard>
        ))}
      </SettingsGrid>
    </Container>
  );
}
