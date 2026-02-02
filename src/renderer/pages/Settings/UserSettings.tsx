import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useSettingsStore } from '../../store/settings-store';
import { useTheme } from '../../theme/ThemeProvider';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  max-width: 600px;
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

const OptionRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const OptionLabel = styled.span`
  color: ${({ theme }) => theme.colors.text};
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

export function UserSettings() {
  const { t, i18n } = useTranslation();
  const { mode, toggleTheme } = useTheme();
  const { language, setLanguage } = useSettingsStore();

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError(t('settings.passwordTooShort'));
      return;
    }

    try {
      // TODO: Implement password change
      console.log('Changing password');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordError(t('settings.passwordChangeFailed'));
    }
  };

  return (
    <Container>
      <Title>{t('settings.userSettings')}</Title>

      <Section>
        <SectionTitle>{t('settings.appearance')}</SectionTitle>

        <OptionRow>
          <OptionLabel>{t('settings.language')}</OptionLabel>
          <Select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="ru">Русский</option>
            <option value="uz">O'zbekcha</option>
          </Select>
        </OptionRow>

        <OptionRow>
          <OptionLabel>{t('settings.theme')}</OptionLabel>
          <Select value={mode} onChange={toggleTheme}>
            <option value="light">{t('settings.lightTheme')}</option>
            <option value="dark">{t('settings.darkTheme')}</option>
          </Select>
        </OptionRow>
      </Section>

      <Section>
        <SectionTitle>{t('settings.changePassword')}</SectionTitle>

        <Form onSubmit={handlePasswordSubmit}>
          <Input
            type="password"
            label={t('settings.currentPassword')}
            value={passwordData.currentPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))
            }
            required
          />

          <Input
            type="password"
            label={t('settings.newPassword')}
            value={passwordData.newPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))
            }
            required
          />

          <Input
            type="password"
            label={t('settings.confirmPassword')}
            value={passwordData.confirmPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))
            }
            required
          />

          {passwordError && (
            <div style={{ color: 'red', fontSize: '14px' }}>{passwordError}</div>
          )}

          <Button type="submit">{t('settings.updatePassword')}</Button>
        </Form>
      </Section>
    </Container>
  );
}
