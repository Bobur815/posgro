import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  Monitor,
  Smartphone,
  Tablet,
  ShoppingCart,
  Wifi,
  LogOut,
  Shield,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@components/common/Button';
import { auth as authApi, DeviceSession } from '../../api/client';
import { useNavigate } from 'react-router-dom';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Section = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const SectionHeader = styled.div`
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const DeviceRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const DeviceIcon = styled.div<{ $current?: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: ${({ theme, $current }) =>
    $current ? theme.colors.primary + '20' : theme.colors.background};
  color: ${({ theme, $current }) =>
    $current ? theme.colors.primary : theme.colors.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const DeviceInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const DeviceName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const DeviceMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Badge = styled.span<{ $variant?: 'current' | 'active' }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background-color: ${({ theme, $variant }) =>
    $variant === 'current' ? theme.colors.primary : theme.colors.success + '20'};
  color: ${({ theme, $variant }) =>
    $variant === 'current' ? '#fff' : theme.colors.success};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const FeedbackText = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: 14px;
  color: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.success)};
`;

// ─── UA parsing helpers ───────────────────────────────────────────────────────

type DeviceType = 'mobile' | 'tablet' | 'terminal' | 'desktop';

function parseUA(ua: string | null): { deviceType: DeviceType; os: string; browser: string } {
  if (!ua) return { deviceType: 'desktop', os: 'Unknown', browser: 'Unknown' };

  const isMobile = /iPhone|Android.*Mobile|BlackBerry|IEMobile|Windows Phone/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) os = 'macOS';
  else if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua)) os = 'iOS (iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/Electron/i.test(ua)) browser = 'POS Terminal';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  const isTerminal = /Electron/i.test(ua);
  const deviceType: DeviceType = isTerminal
    ? 'terminal'
    : isMobile
    ? 'mobile'
    : isTablet
    ? 'tablet'
    : 'desktop';

  return { deviceType, os, browser };
}

function DeviceTypeIcon({ type, current }: { type: DeviceType; current: boolean }) {
  const props = { size: 20 };
  switch (type) {
    case 'mobile': return <Smartphone {...props} />;
    case 'tablet': return <Tablet {...props} />;
    case 'terminal': return <ShoppingCart {...props} />;
    default: return <Monitor {...props} />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DevicesPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ msg: string; error: boolean } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = async () => {
    try {
      const data = await authApi.getSessions();
      setSessions(data);
    } catch {
      setFeedback({ msg: t('devices.loadError'), error: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await authApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setFeedback({ msg: t('devices.revokeSuccess'), error: false });
    } catch {
      setFeedback({ msg: t('devices.revokeError'), error: true });
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevoking('others');
    try {
      await authApi.revokeOtherSessions();
      await load();
      setFeedback({ msg: t('devices.revokeOthersSuccess'), error: false });
    } catch {
      setFeedback({ msg: t('devices.revokeError'), error: true });
    } finally {
      setRevoking(null);
    }
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <Container>
      <TopBar>
        <Button size='medium' variant="secondary" onClick={() => navigate('/settings')}>
          <ArrowLeft size={24} />
        </Button>
        <Title>{t('devices.title')}</Title>
        {otherSessions.length > 0 && (
          <Button
            variant="danger"
            size="small"
            onClick={handleRevokeOthers}
            disabled={revoking === 'others'}
          >
            <LogOut size={16} />
            {revoking === 'others' ? t('common.loading') : t('devices.logoutAllOthers')}
          </Button>
        )}
      </TopBar>

      {feedback && (
        <FeedbackText $error={feedback.error}>{feedback.msg}</FeedbackText>
      )}

      <Section>
        <SectionHeader>
          <Shield size={18} style={{ color: 'var(--color-primary)' }} />
          <SectionTitle>{t('devices.activeSessions')}</SectionTitle>
        </SectionHeader>

        {loading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : sessions.length === 0 ? (
          <EmptyState>{t('devices.noSessions')}</EmptyState>
        ) : (
          sessions.map((session) => {
            const { deviceType, os, browser } = parseUA(session.userAgent);
            const isCurrent = session.isCurrent;
            return (
              <DeviceRow key={session.id}>
                <DeviceIcon $current={isCurrent}>
                  <DeviceTypeIcon type={deviceType} current={isCurrent} />
                </DeviceIcon>

                <DeviceInfo>
                  <DeviceName>
                    {browser} — {os}
                    {isCurrent && (
                      <Badge $variant="current">{t('devices.currentDevice')}</Badge>
                    )}
                    {!isCurrent && (
                      <Badge $variant="active">
                        <Wifi size={10} style={{ marginRight: 3 }} />
                        {t('devices.active')}
                      </Badge>
                    )}
                  </DeviceName>
                  <DeviceMeta>
                    {session.ipAddress && `IP: ${session.ipAddress} · `}
                    {t('devices.loginAt')}: {formatDate(session.createdAt)}
                  </DeviceMeta>
                </DeviceInfo>

                <Actions>
                  {!isCurrent && (
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => handleRevoke(session.id)}
                      disabled={revoking === session.id}
                    >
                      {revoking === session.id ? '...' : t('devices.revoke')}
                    </Button>
                  )}
                </Actions>
              </DeviceRow>
            );
          })
        )}
      </Section>
    </Container>
  );
}
