import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  max-width: 800px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Section = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const InfoText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin: 0;
`;

export function SystemSettings() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState({
    storeName: '',
    storeAddress: '',
    storePhone: '',
    taxRate: '0',
    receiptHeader: '',
    receiptFooter: '',
    syncInterval: '5',
  });

  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSyncTime: string | null;
  }>({ isSyncing: false, lastSyncTime: null });

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await window.electronAPI.settings.getAll();
      setSettings((prev) => ({
        ...prev,
        storeName: allSettings.store_name || '',
        storeAddress: allSettings.store_address || '',
        storePhone: allSettings.store_phone || '',
        taxRate: allSettings.tax_rate || '0',
        receiptHeader: allSettings.receipt_header || '',
        receiptFooter: allSettings.receipt_footer || '',
        syncInterval: allSettings.sync_interval || '5',
      }));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await window.electronAPI.sync.getStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.settings.set('store_name', settings.storeName);
      await window.electronAPI.settings.set('store_address', settings.storeAddress);
      await window.electronAPI.settings.set('store_phone', settings.storePhone);
      await window.electronAPI.settings.set('tax_rate', settings.taxRate);
      alert(t('common.saved'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.settings.set('receipt_header', settings.receiptHeader);
      await window.electronAPI.settings.set('receipt_footer', settings.receiptFooter);
      alert(t('common.saved'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await window.electronAPI.sync.trigger();
      loadSyncStatus();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  return (
    <Container>
      <Title>{t('settings.systemSettings')}</Title>

      <Section>
        <SectionTitle>{t('settings.storeInformation')}</SectionTitle>
        <Form onSubmit={handleSaveStore}>
          <Input
            label={t('settings.storeName')}
            value={settings.storeName}
            onChange={(e) => setSettings((prev) => ({ ...prev, storeName: e.target.value }))}
          />
          <Input
            label={t('settings.storeAddress')}
            value={settings.storeAddress}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, storeAddress: e.target.value }))
            }
          />
          <Row>
            <Input
              label={t('settings.storePhone')}
              value={settings.storePhone}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, storePhone: e.target.value }))
              }
            />
            <Input
              label={t('settings.taxRate')}
              type="number"
              step="0.01"
              value={settings.taxRate}
              onChange={(e) => setSettings((prev) => ({ ...prev, taxRate: e.target.value }))}
            />
          </Row>
          <Actions>
            <Button type="submit">{t('common.save')}</Button>
          </Actions>
        </Form>
      </Section>

      <Section>
        <SectionTitle>{t('settings.receiptSettings')}</SectionTitle>
        <Form onSubmit={handleSaveReceipt}>
          <Input
            label={t('settings.receiptHeader')}
            value={settings.receiptHeader}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, receiptHeader: e.target.value }))
            }
          />
          <Input
            label={t('settings.receiptFooter')}
            value={settings.receiptFooter}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, receiptFooter: e.target.value }))
            }
          />
          <Actions>
            <Button type="submit">{t('common.save')}</Button>
          </Actions>
        </Form>
      </Section>

      <Section>
        <SectionTitle>{t('settings.synchronization')}</SectionTitle>
        <InfoText>
          {t('settings.syncInterval')}: {settings.syncInterval} {t('settings.minutes')}
        </InfoText>
        <InfoText>
          {t('settings.lastSync')}:{' '}
          {syncStatus.lastSyncTime
            ? new Date(syncStatus.lastSyncTime).toLocaleString()
            : t('settings.never')}
        </InfoText>
        <Actions>
          <Button onClick={handleTriggerSync} disabled={syncStatus.isSyncing}>
            {syncStatus.isSyncing ? t('settings.syncing') : t('settings.syncNow')}
          </Button>
        </Actions>
      </Section>
    </Container>
  );
}
