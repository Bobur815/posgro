import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Eye, EyeOff } from 'lucide-react';
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

const TokenUsageBar = styled.div`
  width: 100%;
  height: 10px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 5px;
  overflow: hidden;
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const TokenUsageFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.min($pct, 100)}%;
  background: ${({ $pct, theme }) =>
    $pct >= 90 ? theme.colors.error : $pct >= 60 ? theme.colors.warning : theme.colors.success};
  transition: width 0.3s;
`;

const ApiKeyRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: flex-end;
`;

const ToggleButton = styled.button`
  height: 38px;
  width: 38px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export function SystemSettings() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState({
    storeName: '',
    storeAddress: '',
    storePhone: '',
    taxRate: '0',
    syncInterval: '5',
  });

  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSyncTime: string | null;
  }>({ isSyncing: false, lastSyncTime: null });

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
    loadApiKey();
    loadTokenUsage();
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
        syncInterval: allSettings.sync_interval || '5',
      }));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await window.electronAPI.sync.getStatus();
      setSyncStatus(status as { isSyncing: boolean; lastSyncTime: string | null });
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

  const loadApiKey = async () => {
    try {
      const key = await window.electronAPI.settings.get('anthropic_api_key');
      if (key) setApiKey(key);
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const loadTokenUsage = async () => {
    try {
      const usage = await window.electronAPI.receipt.getTokenUsage();
      setTokenUsage(usage);
    } catch (error) {
      console.error('Failed to load token usage:', error);
    }
  };

  const handleSaveApiKey = async () => {
    try {
      await window.electronAPI.settings.set('anthropic_api_key', apiKey);
      alert(t('aiSettings.apiKeySaved'));
    } catch (error) {
      console.error('Failed to save API key:', error);
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

      <Section>
        <SectionTitle>{t('aiSettings.title')}</SectionTitle>
        <InfoText style={{ marginBottom: '12px' }}>{t('aiSettings.description')}</InfoText>

        {tokenUsage !== null && (() => {
          const pct = Math.round((tokenUsage.used / tokenUsage.limit) * 100);
          return (
            <div style={{ marginBottom: '16px' }}>
              <InfoText style={{ marginBottom: '4px', fontWeight: 500, color: 'inherit' }}>
                {t('aiSettings.tokenUsageTitle')}:{' '}
                <strong>{tokenUsage.used.toLocaleString()}</strong>{' '}
                {t('aiSettings.tokenUsageOf')}{' '}
                <strong>{tokenUsage.limit.toLocaleString()}</strong>{' '}
                ({pct}%)
              </InfoText>
              <TokenUsageBar>
                <TokenUsageFill $pct={pct} />
              </TokenUsageBar>
              <InfoText style={{ fontSize: 12 }}>{t('aiSettings.tokenLimitNote')}</InfoText>
            </div>
          );
        })()}

        <ApiKeyRow>
          <div style={{ flex: 1 }}>
            <Input
              label={t('aiSettings.anthropicApiKey')}
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('aiSettings.apiKeyPlaceholder')}
            />
          </div>
          <ToggleButton type="button" onClick={() => setShowApiKey(!showApiKey)}>
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </ToggleButton>
        </ApiKeyRow>
        <Actions>
          <Button onClick={handleSaveApiKey}>{t('common.save')}</Button>
        </Actions>
      </Section>
    </Container>
  );
}
