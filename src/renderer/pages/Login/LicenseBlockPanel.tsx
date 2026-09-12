import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ExternalLink, Lock } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useToast } from '../../context/ToastContext';
import type {
  StoreSubscription,
  TillLicenseStatus,
} from '../../../shared/types/store.types';

/**
 * In place of the PIN pad and the password form when the till's license lets nobody in: the store
 * is blocked for its subscription, or the till is overdue to check in with the server. It says
 * which, shows how to pay, and "Check payment" asks the server at once — paying is all it takes to
 * get back in.
 */

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.error}10;
  text-align: center;
`;

const Icon = styled.div`
  color: ${({ theme }) => theme.colors.error};
`;

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.error};
`;

const Text = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* The QR stays on white whatever the theme — a dark ground breaks scanner contrast. */
const QrFrame = styled.div`
  background: #fff;
  border-radius: 10px;
  padding: 10px;
`;

const QrImage = styled.img`
  width: 180px;
  height: 180px;
  display: block;
`;

const LinkButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 16px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
`;

interface Props {
  status: TillLicenseStatus;
  onStatus: (status: TillLicenseStatus) => void;
}

export function LicenseBlockPanel({ status, onStatus }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const blocked = status.state === 'blocked';
  const [payment, setPayment] = useState<StoreSubscription['payment'] | null>(null);
  const [checking, setChecking] = useState(false);

  // How to pay: the same details as the subscription dialog, cached, so they show offline too.
  useEffect(() => {
    if (!blocked) return;
    let alive = true;
    window.electronAPI.subscription
      .get()
      .then((s) => {
        if (alive) setPayment(s.payment);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [blocked]);

  const check = async () => {
    setChecking(true);
    try {
      const next = await window.electronAPI.license.refresh();
      onStatus(next);
      if (!next.canSignIn) toast.error(t(blocked ? 'license.notYet' : 'license.notYetCheckin'));
    } catch {
      toast.error(t('license.notYetCheckin'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Panel role="alert">
      <Icon>
        <Lock size={28} />
      </Icon>
      <Title>{blocked ? t('subscription.blockedTitle') : t('license.checkinTitle')}</Title>
      <Text>
        {t(blocked ? 'auth.errors.subscription_blocked' : 'auth.errors.license_checkin_required')}
      </Text>

      {blocked && payment?.qrDataUrl && (
        <>
          <Hint>{t('subscription.payScanHint')}</Hint>
          <QrFrame>
            <QrImage src={payment.qrDataUrl} alt={t('subscription.payTitle')} />
          </QrFrame>
        </>
      )}
      {blocked && payment?.paymentUrl && (
        <LinkButton
          type="button"
          onClick={() => void window.electronAPI.subscription.openPaymentLink(payment.paymentUrl)}
        >
          <ExternalLink size={16} />
          {t('subscription.payOnline')}
        </LinkButton>
      )}
      {blocked && payment?.supportPhone && (
        <Hint>{t('subscription.callSupport', { phone: payment.supportPhone })}</Hint>
      )}

      <Button onClick={check} disabled={checking} fullWidth>
        {checking
          ? t('license.checking')
          : t(blocked ? 'license.checkPayment' : 'license.checkNow')}
      </Button>
    </Panel>
  );
}
