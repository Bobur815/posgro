import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@components/common/Button';
import { Input } from '@components/common/Input';
import { settings as settingsApi } from '../../api/client';

const Container = styled.div`max-width: 800px;`;
const Title = styled.h1`margin: 0 0 ${({ theme }) => theme.spacing.lg}; color: ${({ theme }) => theme.colors.text};`;
const Section = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;
const SectionTitle = styled.h2`margin: 0 0 ${({ theme }) => theme.spacing.md}; font-size: 18px; color: ${({ theme }) => theme.colors.text};`;
const Form = styled.form`display: flex; flex-direction: column; gap: ${({ theme }) => theme.spacing.md};`;
const Row = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: ${({ theme }) => theme.spacing.md}; @media (max-width: 600px) { grid-template-columns: 1fr; }`;
const Actions = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.md}; margin-top: ${({ theme }) => theme.spacing.md};`;
const InfoText = styled.p`color: ${({ theme }) => theme.colors.textSecondary}; font-size: 14px; margin: 0;`;
const ApiKeyRow = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.sm}; align-items: flex-end;`;
const ToggleButton = styled.button`
  height: 38px; width: 38px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;
const SuccessText = styled.p`color: ${({ theme }) => theme.colors.success}; font-size: 14px; margin: 0;`;

export function SystemSettings() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState({
    storeName: '', storeAddress: '', storePhone: '', taxRate: '0',
  });
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => { loadSettings(); loadApiKey(); }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await settingsApi.getAll();
      setSettings((prev) => ({
        ...prev,
        storeName: allSettings.store_name || '',
        storeAddress: allSettings.store_address || '',
        storePhone: allSettings.store_phone || '',
        taxRate: allSettings.tax_rate || '0',
      }));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadApiKey = async () => {
    try {
      const key = await settingsApi.get('anthropic_api_key');
      if (key) setApiKey(key);
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    try {
      await settingsApi.set('store_name', settings.storeName);
      await settingsApi.set('store_address', settings.storeAddress);
      await settingsApi.set('store_phone', settings.storePhone);
      await settingsApi.set('tax_rate', settings.taxRate);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('idle');
    }
  };

  const handleSaveApiKey = async () => {
    try {
      await settingsApi.set('anthropic_api_key', apiKey);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  };

  return (
    <Container>
      <Title>{t('settings.systemSettings')}</Title>

      <Section>
        <SectionTitle>{t('settings.storeInformation')}</SectionTitle>
        <Form onSubmit={handleSaveStore}>
          <Input label={t('settings.storeName')} value={settings.storeName} onChange={(e) => setSettings((prev) => ({ ...prev, storeName: e.target.value }))} />
          <Input label={t('settings.storeAddress')} value={settings.storeAddress} onChange={(e) => setSettings((prev) => ({ ...prev, storeAddress: e.target.value }))} />
          <Row>
            <Input label={t('settings.storePhone')} value={settings.storePhone} onChange={(e) => setSettings((prev) => ({ ...prev, storePhone: e.target.value }))} />
            <Input label={t('settings.taxRate')} type="number" step="0.01" value={settings.taxRate} onChange={(e) => setSettings((prev) => ({ ...prev, taxRate: e.target.value }))} />
          </Row>
          <Actions>
            <Button type="submit" disabled={saveStatus === 'saving'}>{saveStatus === 'saving' ? t('common.saving') : t('common.save')}</Button>
            {saveStatus === 'saved' && <SuccessText>{t('common.saved')}</SuccessText>}
          </Actions>
        </Form>
      </Section>

      <Section>
        <SectionTitle>{t('aiSettings.title')}</SectionTitle>
        <InfoText style={{ marginBottom: '12px' }}>{t('aiSettings.description')}</InfoText>
        <ApiKeyRow>
          <div style={{ flex: 1 }}>
            <Input label={t('aiSettings.anthropicApiKey')} type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('aiSettings.apiKeyPlaceholder')} />
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
