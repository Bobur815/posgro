import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { buildSampleReceiptHTML } from '../../../shared/receipt-html';
import type { ReceiptSettings as ReceiptSettingsType } from '../../../shared/receipt-html';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const ContentLayout = styled.div`
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const PanelTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 15px;
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

const StoreInfo = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const PreviewContainer = styled.div`
  display: flex;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  overflow: auto;
`;

const PreviewFrame = styled.iframe`
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: #fff;
  border-radius: 4px;
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

export function ReceiptSettings() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<ReceiptSettingsType>({
    receipt_width: '80',
    receipt_language: 'ru',
    receipt_header: '',
    receipt_footer: '',
    store_name: '',
    store_address: '',
    store_phone: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await window.electronAPI.settings.getAll();
        setSettings({
          receipt_width: (all.receipt_width as '80' | '58') || '80',
          receipt_language: (all.receipt_language as 'ru' | 'uz') || 'ru',
          receipt_header: all.receipt_header || '',
          receipt_footer: all.receipt_footer || '',
          store_name: all.store_name || '',
          store_address: all.store_address || '',
          store_phone: all.store_phone || '',
        });
      } catch (err) {
        console.error('Failed to load receipt settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const previewHtml = useMemo(() => buildSampleReceiptHTML(settings), [settings]);

  const iframeWidth = settings.receipt_width === '58' ? 220 : 305;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await window.electronAPI.settings.set('receipt_width', settings.receipt_width);
      await window.electronAPI.settings.set('receipt_language', settings.receipt_language);
      await window.electronAPI.settings.set('receipt_header', settings.receipt_header);
      await window.electronAPI.settings.set('receipt_footer', settings.receipt_footer);
      alert(t('common.saved'));
    } catch (err) {
      console.error('Failed to save receipt settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Title>{t('common.loading')}</Title>
      </Container>
    );
  }

  return (
    <Container>
      <Title>{t('receipt.title')}</Title>

      <ContentLayout>
        {/* Left panel — Settings */}
        <Panel>
          <PanelTitle>{t('receipt.title')}</PanelTitle>
          <Form onSubmit={handleSave}>
            <Row>
              <Select
                label={t('receipt.paperWidth')}
                value={settings.receipt_width}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    receipt_width: e.target.value as '80' | '58',
                  }))
                }
                options={[
                  { value: '80', label: t('receipt.width80') },
                  { value: '58', label: t('receipt.width58') },
                ]}
              />
              <Select
                label={t('receipt.language')}
                value={settings.receipt_language}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    receipt_language: e.target.value as 'ru' | 'uz',
                  }))
                }
                options={[
                  { value: 'ru', label: 'Русский' },
                  { value: 'uz', label: "O'zbek" },
                ]}
              />
            </Row>

            <Input
              label={t('receipt.header')}
              value={settings.receipt_header}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, receipt_header: e.target.value }))
              }
            />
            <Input
              label={t('receipt.footer')}
              value={settings.receipt_footer}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, receipt_footer: e.target.value }))
              }
            />

            <StoreInfo>
              {settings.store_name && <div><strong>{settings.store_name}</strong></div>}
              {settings.store_address && <div>{settings.store_address}</div>}
              {settings.store_phone && <div>{settings.store_phone}</div>}
              {!settings.store_name && !settings.store_address && (
                <div>{t('receipt.storeInfoHint')}</div>
              )}
            </StoreInfo>

            <Actions>
              <Button type="submit" disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </Actions>
          </Form>
        </Panel>

        {/* Right panel — Live preview */}
        <Panel>
          <PanelTitle>{t('receipt.preview')}</PanelTitle>
          <PreviewContainer>
            <PreviewFrame
              srcDoc={previewHtml}
              width={iframeWidth}
              height={500}
              title="Receipt preview"
            />
          </PreviewContainer>
        </Panel>
      </ContentLayout>
    </Container>
  );
}
