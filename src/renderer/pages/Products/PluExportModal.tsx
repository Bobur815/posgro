import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useToast } from '../../context/ToastContext';
import type { TxpSkipped } from '../../../shared/utils/rongta-txp';

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SkippedList = styled.ul`
  margin: 0;
  padding-left: ${({ theme }) => theme.spacing.lg};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface PluExportModalProps {
  onClose: () => void;
}

/** Writes the Rongta PLU file (C:\RLS\posgro-plu.TXP) for the RLS1000 PLU manager. */
export function PluExportModal({ onClose }: PluExportModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [skipped, setSkipped] = useState<TxpSkipped[]>([]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await window.electronAPI.scale.exportTxp();
      setSkipped(result.skipped);
      toast.success(t('scaleSettings.pluExportDone', { count: result.exported, path: result.path }));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title={t('scaleSettings.pluExportTitle')} onClose={onClose} width="600px">
      <Body>
        <Hint>{t('scaleSettings.pluExportHint')}</Hint>
        <div>
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? t('common.processing') : t('scaleSettings.pluExportButton')}
          </Button>
        </div>
        {skipped.length > 0 && (
          <>
            <Hint>{t('scaleSettings.pluExportSkipped', { count: skipped.length })}</Hint>
            <SkippedList>
              {skipped.map((s) => (
                <li key={s.id}>
                  #{s.id} {s.name || '—'} — {t(`scaleSettings.pluSkip_${s.reason}`)}
                </li>
              ))}
            </SkippedList>
          </>
        )}
      </Body>
    </Modal>
  );
}
