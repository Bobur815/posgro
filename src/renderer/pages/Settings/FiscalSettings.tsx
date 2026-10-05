import React, { useState, useEffect, useCallback } from 'react';
import styled, { useTheme } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useVirtualKeyboard } from '../../hooks/useVirtualKeyboard';
import {
  KeyboardToggle,
  KeyboardPanel,
} from '../../components/common/VirtualKeyboardControls';
import {
  SettingsPage,
  SettingsGrid,
  FieldGrid,
  GroupTitle,
} from '../../components/common/SettingsLayout';
import { useToast } from '../../context/ToastContext';
import type {
  FiscalConnectionResult,
  FiscalQueueStatus,
  FiscalTimings,
} from '@shared/types';
import { FiscalBacklogCard } from './FiscalBacklogCard';
import { DuplicateCodesCard } from './DuplicateCodesCard';
import {
  PHASE_COLOR,
  phaseBreakdown,
  vcrBreakdown,
  stackPercents,
  slowestPhase,
  formatMs,
} from './fiscalTimings';

const Container = styled(SettingsPage)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding-left: 25px;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;

const Row = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const StatusLine = styled.div<{ $ok?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 14px;
  color: ${({ theme, $ok }) => ($ok ? theme.colors.success ?? theme.colors.primary : theme.colors.error)};
`;

const Muted = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const OutList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
`;

const StackBar = styled.div`
  display: flex;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.border};
`;

const StackSeg = styled.div<{ $pct: number; $color: string }>`
  width: ${({ $pct }) => $pct}%;
  background: ${({ $color }) => $color};
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Swatch = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text};

  th,
  td {
    text-align: right;
    padding: 3px 0;
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    text-align: left;
    width: 100%;
  }
  th {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const NameCell = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const Headline = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatValue = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const StatLabel = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const RecentRow = styled.div<{ $slow?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme, $slow }) => ($slow ? theme.colors.error : theme.colors.text)};
`;

export function FiscalSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  // Phase colours are read from the theme so the readout follows light/dark like everything else.
  const theme = useTheme();

  // Units and phase names live here rather than in fiscalTimings.ts because they are pure
  // presentation — the module holds the arithmetic, this holds the wording.
  const fmt = (ms: number) =>
    formatMs(ms, t('fiscalSettings.timings.ms', 'мс'), t('fiscalSettings.timings.sec', 'с'));
  const phaseLabel = (name: string) =>
    ({
      queue: t('fiscalSettings.timings.phase.queue', 'Ожидание очереди'),
      config: t('fiscalSettings.timings.phase.config', 'Настройки'),
      load: t('fiscalSettings.timings.phase.load', 'Чтение чека'),
      zreport: t('fiscalSettings.timings.phase.zreport', 'Z-отчёт'),
      build: t('fiscalSettings.timings.phase.build', 'Подготовка позиций'),
      'vcr-sale': t('fiscalSettings.timings.phase.vcrSale', 'Касса REGOS'),
      persist: t('fiscalSettings.timings.phase.persist', 'Сохранение'),
      recover: t('fiscalSettings.timings.phase.recover', 'Восстановление чека'),
    })[name] ?? name;

  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('http://127.0.0.1:22298');
  const [login, setLogin] = useState('kassa');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [vatPercent, setVatPercent] = useState('12');
  const [nonVatPayer, setNonVatPayer] = useState(false);
  const [posId, setPosId] = useState('');
  const [vcrPrintsReceipt, setVcrPrintsReceipt] = useState(false);
  const [markingCodeCheck, setMarkingCodeCheck] = useState(true);
  // Held as strings so the number inputs stay editable while being typed (an empty field must
  // not snap back to 0). Parsed on save; the main process floors them anyway.
  const [uzqrEnabled, setUzqrEnabled] = useState(false);
  // This till only (system setting `click_enabled`, local-only): Click is fiscalised as cash.
  const [clickEnabled, setClickEnabled] = useState(false);
  const [uzqrPollMs, setUzqrPollMs] = useState('2000');
  const [uzqrTimeoutMs, setUzqrTimeoutMs] = useState('120000');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FiscalConnectionResult | null>(null);
  const [queue, setQueue] = useState<FiscalQueueStatus | null>(null);
  // The backlog stepper is a paid service: shown only while the store's license has it open.
  const [backlogAllowed, setBacklogAllowed] = useState(false);
  const [timings, setTimings] = useState<FiscalTimings | null>(null);

  // Config load state. The form must NOT show its editable defaults until the real config has
  // loaded — otherwise a transient load failure would display defaults that, if saved, would
  // clobber the stored url/login/password. Render a loading/error gate instead.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // On-screen keyboard. Every field here is its own useState, so the setter map is all the
  // apply step needs — React's updater form does the append/backspace the hook asks for.
  type TextField = 'url' | 'login' | 'password' | 'posId' | 'uzqrPollMs' | 'uzqrTimeoutMs';
  const fieldSetters: Record<TextField, React.Dispatch<React.SetStateAction<string>>> = {
    url: setUrl,
    login: setLogin,
    password: setPassword,
    posId: setPosId,
    uzqrPollMs: setUzqrPollMs,
    uzqrTimeoutMs: setUzqrTimeoutMs,
  };
  const keyboard = useVirtualKeyboard<TextField>((field, edit) =>
    fieldSetters[field](edit),
  );

  const loadConfig = useCallback(async () => {
    setLoadError(false);
    try {
      const cfg = await window.electronAPI.fiscal.getConfig();
      setEnabled(cfg.enabled);
      setUrl(cfg.url);
      setLogin(cfg.login);
      setHasPassword(cfg.hasPassword);
      setVatPercent(String(cfg.vatPercent));
      setNonVatPayer(cfg.nonVatPayer);
      setPosId(cfg.posId);
      setVcrPrintsReceipt(cfg.vcrPrintsReceipt);
      setMarkingCodeCheck(cfg.markingCodeCheck);
      setUzqrEnabled(cfg.uzqrEnabled);
      setUzqrPollMs(String(cfg.uzqrPollMs));
      setUzqrTimeoutMs(String(cfg.uzqrTimeoutMs));
      setClickEnabled((await window.electronAPI.settings.get('click_enabled')) === 'true');
      setLoaded(true);
    } catch {
      // Don't fall back to editable defaults — surface the error and let the user retry, so a
      // transient failure can't be silently re-saved over the stored config.
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    window.electronAPI.fiscal.getTimings().then(setTimings).catch(() => {});
    window.electronAPI.fiscal.getStatus().then(setQueue).catch(() => {});
    window.electronAPI.fiscal.backlogAllowed().then(setBacklogAllowed).catch(() => setBacklogAllowed(false));
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const cfg = await window.electronAPI.fiscal.setConfig({
        enabled,
        url,
        login,
        vatPercent: Number(vatPercent),
        nonVatPayer,
        posId,
        vcrPrintsReceipt,
        markingCodeCheck,
        uzqrEnabled,
        uzqrPollMs: Number(uzqrPollMs),
        uzqrTimeoutMs: Number(uzqrTimeoutMs),
        ...(password ? { password } : {}),
      });
      await window.electronAPI.settings.set('click_enabled', String(clickEnabled));
      setUzqrPollMs(String(cfg.uzqrPollMs));
      setUzqrTimeoutMs(String(cfg.uzqrTimeoutMs));
      setHasPassword(cfg.hasPassword);
      setPassword('');
      // The backlog card is gated on the saved "enabled" flag — re-read it, or turning
      // fiscalisation on leaves the card greyed out until the screen is reopened.
      refreshQueue();
      toast.success(t('common.saved', 'Сохранено'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const refreshQueue = useCallback(() => {
    window.electronAPI.fiscal.getStatus().then(setQueue).catch(() => {});
  }, []);

  const refreshTimings = useCallback(() => {
    window.electronAPI.fiscal.getTimings().then(setTimings).catch(() => {});
  }, []);

  const handleResetTimings = async () => {
    try {
      await window.electronAPI.fiscal.resetTimings();
      refreshTimings();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.fiscal.testConnection();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: t('common.error') });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Container>
      <Header>
        <Button variant="secondary" size="small" onClick={() => navigate('/settings')}>
          <ArrowLeft size={20} />
        </Button>
        <Title>{t('fiscalSettings.title', 'Фискализация (REGOS:VCR)')}</Title>
        {loaded && <KeyboardToggle kb={keyboard} style={{ marginLeft: 'auto' }} />}
      </Header>

      {!loaded ? (
        <Card>
          {loadError ? (
            <>
              <StatusLine>
                <XCircle size={16} />
                {t('fiscalSettings.loadError', 'Не удалось загрузить настройки фискализации')}
              </StatusLine>
              <ButtonRow>
                <Button variant="secondary" onClick={loadConfig}>
                  {t('common.retry', 'Повторить')}
                </Button>
              </ButtonRow>
            </>
          ) : (
            <Muted>{t('common.loading', 'Загрузка...')}</Muted>
          )}
        </Card>
      ) : (
      <Card>
        <Row>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('fiscalSettings.enabled', 'Включить фискализацию через REGOS:VCR')}
        </Row>

        <GroupTitle>{t('fiscalSettings.groupConnection', 'Подключение')}</GroupTitle>
        <FieldGrid>
          <Field>
            <Label>{t('fiscalSettings.url', 'Адрес виртуальной кассы')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              {...keyboard.fieldProps('url')}
              placeholder="http://127.0.0.1:22298"
            />
          </Field>

          <Field>
            <Label>{t('fiscalSettings.posId', 'ID кассы (pos_id)')}</Label>
            <Input value={posId} onChange={(e) => setPosId(e.target.value)} {...keyboard.fieldProps('posId')} />
          </Field>

          <Field>
            <Label>{t('fiscalSettings.login', 'Логин кассира')}</Label>
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              {...keyboard.fieldProps('login')}
              placeholder="cassir"
            />
          </Field>

          <Field>
            <Label>{t('fiscalSettings.password', 'Пароль кассира')}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...keyboard.fieldProps('password')}
              placeholder={hasPassword ? '•••••••• (сохранён)' : ''}
            />
          </Field>
        </FieldGrid>

        <GroupTitle>{t('fiscalSettings.groupVat', 'НДС')}</GroupTitle>
        <Row>
          <input
            type="checkbox"
            checked={nonVatPayer}
            onChange={(e) => setNonVatPayer(e.target.checked)}
          />
          {t('fiscalSettings.nonVatPayer', 'Организация не является плательщиком НДС (отправлять «Без НДС»)')}
        </Row>
        <FieldGrid>
          <Field>
            <Label>{t('fiscalSettings.vat', 'Ставка НДС, %')}</Label>
            <Select
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
              disabled={nonVatPayer}
            >
              <option value="0">0%</option>
              <option value="12">12%</option>
            </Select>
            {nonVatPayer && (
              <Muted>
                {t(
                  'fiscalSettings.nonVatPayerHint',
                  'Для неплательщика НДС ставка игнорируется — во все позиции отправляется «Без НДС».',
                )}
              </Muted>
            )}
          </Field>
        </FieldGrid>

        <GroupTitle>{t('fiscalSettings.groupBehaviour', 'Печать и маркировка')}</GroupTitle>
        <Row>
          <input
            type="checkbox"
            checked={vcrPrintsReceipt}
            onChange={(e) => setVcrPrintsReceipt(e.target.checked)}
          />
          {t('fiscalSettings.vcrPrintsReceipt', 'Чек печатает виртуальная касса (не печатать из POS)')}
        </Row>

        <Row>
          <input
            type="checkbox"
            checked={markingCodeCheck}
            onChange={(e) => setMarkingCodeCheck(e.target.checked)}
          />
          {t('fiscalSettings.markingCodeCheck', 'Проверять повторную продажу маркированных товаров (группа 022)')}
        </Row>

        <GroupTitle>{t('fiscalSettings.groupUzqr', 'UzQR')}</GroupTitle>
        {/* UzQR is off by default: stores that already take UzQR through a bank terminal must
            keep the current behaviour until someone deliberately opts in. */}
        <Row>
          <input
            type="checkbox"
            checked={uzqrEnabled}
            onChange={(e) => setUzqrEnabled(e.target.checked)}
          />
          {t('fiscalSettings.uzqrEnabled', 'Оплата UzQR через REGOS (QR-код на экране кассы)')}
        </Row>

        {uzqrEnabled && (
          <>
            <Muted>
              {t(
                'fiscalSettings.uzqrHint',
                'Покупатель сканирует QR-код с экрана. Чек создаётся только после подтверждения оплаты. Если выключено — UzQR остаётся обычным способом оплаты без QR-кода.',
              )}
            </Muted>
            <FieldGrid>
              <Field>
                <Label>{t('fiscalSettings.uzqrPollMs', 'Интервал опроса, мс')}</Label>
                <Input
                  type="number"
                  value={uzqrPollMs}
                  onChange={(e) => setUzqrPollMs(e.target.value)}
                  {...keyboard.fieldProps('uzqrPollMs', { numeric: true, clearOnFirstKey: true })}
                  placeholder="2000"
                />
              </Field>
              <Field>
                <Label>{t('fiscalSettings.uzqrTimeoutMs', 'Ожидание оплаты, мс')}</Label>
                <Input
                  type="number"
                  value={uzqrTimeoutMs}
                  onChange={(e) => setUzqrTimeoutMs(e.target.value)}
                  {...keyboard.fieldProps('uzqrTimeoutMs', { numeric: true, clearOnFirstKey: true })}
                  placeholder="120000"
                />
              </Field>
            </FieldGrid>
          </>
        )}

        <GroupTitle>{t('fiscalSettings.groupClick', 'Click')}</GroupTitle>
        {/* Off by default: the Checkout shows the Click tile only on tills where this is on. */}
        <Row>
          <input
            type="checkbox"
            checked={clickEnabled}
            onChange={(e) => setClickEnabled(e.target.checked)}
          />
          {t('fiscalSettings.clickEnabled', 'Принимать оплату Click на этой кассе')}
        </Row>
        <Muted>
          {t(
            'fiscalSettings.clickHint',
            'В чеке REGOS оплата Click отправляется как наличные. В кассовый ящик не попадает; в отчётах — отдельной строкой.',
          )}
        </Muted>

        <ButtonRow>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
          <Button variant="secondary" onClick={handleTest} disabled={testing}>
            {testing ? t('common.processing') : t('fiscalSettings.testConnection', 'Проверить связь')}
          </Button>
        </ButtonRow>

        {testResult && (
          testResult.ok ? (
            <StatusLine $ok>
              <CheckCircle size={16} />
              {t('fiscalSettings.connected', 'Связь установлена')} — {testResult.terminalId} (applet {testResult.appletVersion})
            </StatusLine>
          ) : (
            <StatusLine>
              <XCircle size={16} />
              {testResult.error}
            </StatusLine>
          )
        )}
      </Card>
      )}

      {/* The queue card is short and the timings card is tall; side by side they fill the width
          that used to be empty, and neither pushes the other below the fold. 430px keeps the
          timings tables readable — below that the pair collapses back to one column. */}
      <SettingsGrid $min={430}>
      {queue && backlogAllowed && <FiscalBacklogCard queue={queue} onChanged={refreshQueue} />}
      <DuplicateCodesCard />

      {timings && (
        <Card>
          <Label>{t('fiscalSettings.timings.title', 'Время фискализации')}</Label>

          {(() => {
            const total = timings.phases['phase:TOTAL'];
            const failed = timings.phases['phase:TOTAL_FAILED'];
            const breakdown = phaseBreakdown(timings.phases);
            const vcr = vcrBreakdown(timings.phases);
            const pcts = stackPercents(breakdown);

            if (!total && !failed) {
              return (
                <Muted>
                  {t(
                    'fiscalSettings.timings.empty',
                    'Пока нет данных — они появятся после первой фискализации на этом терминале. Счётчики сбрасываются при перезапуске программы.',
                  )}
                </Muted>
              );
            }

            return (
              <>
                <Headline>
                  <Stat>
                    <StatValue>{total ? fmt(total.p50Ms) : '—'}</StatValue>
                    <StatLabel>{t('fiscalSettings.timings.median', 'медиана')}</StatLabel>
                  </Stat>
                  <Stat>
                    <StatValue>{total ? fmt(total.p95Ms) : '—'}</StatValue>
                    <StatLabel>{t('fiscalSettings.timings.p95', '95-й процентиль')}</StatLabel>
                  </Stat>
                  <Stat>
                    <StatValue>{total ? fmt(total.maxMs) : '—'}</StatValue>
                    <StatLabel>{t('fiscalSettings.timings.max', 'максимум')}</StatLabel>
                  </Stat>
                  <Stat>
                    <StatValue>
                      {total?.count ?? 0}
                      {failed ? ` / ${failed.count}` : ''}
                    </StatValue>
                    <StatLabel>
                      {failed
                        ? t('fiscalSettings.timings.countWithFailed', 'чеков / ошибок')
                        : t('fiscalSettings.timings.count', 'чеков')}
                    </StatLabel>
                  </Stat>
                </Headline>

                {pcts.length > 0 && (
                  <>
                    <StackBar>
                      {breakdown.map((p, i) => (
                        <StackSeg
                          key={p.name}
                          $pct={pcts[i]}
                          $color={theme.colors[PHASE_COLOR[p.name]]}
                          title={`${phaseLabel(p.name)} — ${fmt(p.meanMs)}`}
                        />
                      ))}
                    </StackBar>
                    <Legend>
                      {breakdown.map((p) => (
                        <LegendItem key={p.name}>
                          <Swatch $color={theme.colors[PHASE_COLOR[p.name]]} />
                          {phaseLabel(p.name)}
                        </LegendItem>
                      ))}
                    </Legend>
                  </>
                )}

                <Table>
                  <thead>
                    <tr>
                      <th>{t('fiscalSettings.timings.phaseCol', 'Этап')}</th>
                      <th>{t('fiscalSettings.timings.median', 'медиана')}</th>
                      <th>{t('fiscalSettings.timings.p95', '95-й процентиль')}</th>
                      <th>{t('fiscalSettings.timings.max', 'максимум')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((p) => (
                      <tr key={p.name}>
                        <td>
                          <NameCell>
                            <Swatch $color={theme.colors[PHASE_COLOR[p.name]]} />
                            {phaseLabel(p.name)}
                          </NameCell>
                        </td>
                        <td>{fmt(p.stats.p50Ms)}</td>
                        <td>{fmt(p.stats.p95Ms)}</td>
                        <td>{fmt(p.stats.maxMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <Muted>
                  {t(
                    'fiscalSettings.timings.hint',
                    'Если основное время в «Касса REGOS» — задержка на стороне кассы. Если в «Ожидание очереди» — чеки становятся в очередь друг за другом. Остальные этапы выполняются на этом компьютере.',
                  )}
                </Muted>

                {vcr.length > 0 && (
                  <>
                    <Label>{t('fiscalSettings.timings.vcrCalls', 'Запросы к виртуальной кассе')}</Label>
                    <Table>
                      <thead>
                        <tr>
                          <th>{t('fiscalSettings.timings.methodCol', 'Метод')}</th>
                          <th>{t('fiscalSettings.timings.calls', 'запросов')}</th>
                          <th>{t('fiscalSettings.timings.median', 'медиана')}</th>
                          <th>{t('fiscalSettings.timings.max', 'максимум')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vcr.map((v) => (
                          <tr key={v.method}>
                            <td>{v.method}</td>
                            <td>{v.stats.count}</td>
                            <td>{fmt(v.stats.p50Ms)}</td>
                            <td>{fmt(v.stats.maxMs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </>
                )}

                {timings.recent.length > 0 && (
                  <>
                    <Label>{t('fiscalSettings.timings.recent', 'Последние чеки')}</Label>
                    <OutList>
                      {timings.recent.slice(0, 10).map((r, i) => {
                        const slowest = slowestPhase(r.phases);
                        return (
                          <RecentRow key={`${r.receiptNumber}-${r.at}-${i}`} $slow={!r.ok}>
                            <span>
                              #{r.receiptNumber}
                              {/* Marked codes are verified inside REGOS's own call, so they are
                                  the first thing to read a slow receipt against. */}
                              {r.positions !== undefined
                                ? ` · ${r.positions} ${t('fiscalSettings.timings.positions', 'поз.')}${
                                    r.marked
                                      ? ` / ${r.marked} ${t('fiscalSettings.timings.marked', 'марк.')}`
                                      : ''
                                  }`
                                : ''}
                              {slowest ? ` · ${phaseLabel(slowest.name)}` : ''}
                              {r.ok ? '' : ` · ${t('fiscalSettings.failed', 'Ошибки')}`}
                            </span>
                            <span>{fmt(r.totalMs)}</span>
                          </RecentRow>
                        );
                      })}
                    </OutList>
                  </>
                )}
              </>
            );
          })()}

          <ButtonRow>
            <Button variant="secondary" onClick={refreshTimings}>
              {t('fiscalSettings.timings.refresh', 'Обновить')}
            </Button>
            <Button variant="secondary" onClick={handleResetTimings}>
              {t('fiscalSettings.timings.reset', 'Сбросить счётчики')}
            </Button>
          </ButtonRow>
        </Card>
      )}
      </SettingsGrid>

      <KeyboardPanel kb={keyboard} />
    </Container>
  );
}
