import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { useTheme } from 'styled-components';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Select } from '../../components/common/Select';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type DatePreset =
  | 'today'
  | 'weekStart'
  | 'last7'
  | 'monthStart'
  | 'last30'
  | 'yearStart'
  | 'last365'
  | 'custom';

interface AnalyticsData {
  salesTrend: { date: string; revenue: number; count: number }[];
  salesByCategory: { categoryRu: string; categoryUz: string; revenue: number; quantity: number }[];
  hourlyDistribution: { hour: number; revenue: number; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  cashierPerformance: { name: string; revenue: number; count: number }[];
  profitMargins: { categoryRu: string; categoryUz: string; revenue: number; cost: number }[];
  summary: {
    totalSales: number;
    totalRevenue: number;
    cashSales: number;
    cardSales: number;
    averageTransaction: number;
  };
}

// ── Date range helpers ────────────────────────────────────────────────────────

function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } {
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  switch (preset) {
    case 'today': {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { start, end: todayEnd };
    }
    case 'weekStart': {
      const start = new Date();
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      return { start, end: todayEnd };
    }
    case 'last7': {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end: todayEnd };
    }
    case 'monthStart': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: todayEnd };
    }
    case 'last30': {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end: todayEnd };
    }
    case 'yearStart': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: todayEnd };
    }
    case 'last365': {
      const start = new Date();
      start.setDate(start.getDate() - 364);
      start.setHours(0, 0, 0, 0);
      return { start, end: todayEnd };
    }
    case 'custom': {
      const start = customStart ? new Date(customStart) : new Date();
      const end = customEnd ? new Date(customEnd) : new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

// ── Styled components ─────────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding-left: 25px;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const PresetSelect = styled(Select)`
  min-width: 200px;
`;

const DateInput = styled.input`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const DateSep = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const KpiCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const KpiLabel = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const KpiValue = styled.div`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
`;

const NoData = styled.div`
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const LoadingText = styled.div`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function Analytics() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalId, setTerminalId] = useState('');
  const [knownTerminals, setKnownTerminals] = useState<string[]>([]);

  const lang = i18n.language as 'ru' | 'uz';
  const fmt = (amount: number) => formatCurrencyBase(amount, lang);

  useEffect(() => {
    window.electronAPI.terminals.getKnown().then(setKnownTerminals).catch(() => {});
  }, []);

  const presetOptions = [
    { value: 'today', label: t('reports.today') },
    { value: 'weekStart', label: t('reports.thisWeek') },
    { value: 'last7', label: t('reports.last7Days') },
    { value: 'monthStart', label: t('reports.thisMonth') },
    { value: 'last30', label: t('reports.last30Days') },
    { value: 'yearStart', label: t('reports.thisYear') },
    { value: 'last365', label: t('reports.last365Days') },
    { value: 'custom', label: t('reports.custom') },
  ];

  const fetchData = useCallback(async () => {
    if (preset === 'custom' && (!customStart || !customEnd)) return;
    setIsLoading(true);
    try {
      const { start, end } = getDateRange(preset, customStart, customEnd);
      const result = await window.electronAPI.analytics.getData({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        terminalId: terminalId || undefined,
      });
      setData(result as AnalyticsData);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [preset, customStart, customEnd, terminalId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Prepare localised data
  const categoryData =
    data?.salesByCategory.map((c) => ({
      name: lang === 'ru' ? c.categoryRu : c.categoryUz,
      revenue: c.revenue,
    })) ?? [];

  const profitData =
    data?.profitMargins.map((c) => ({
      name: lang === 'ru' ? c.categoryRu : c.categoryUz,
      revenue: c.revenue,
      cost: c.cost,
    })) ?? [];

  const PRIMARY = theme.colors.primary;
  const SUCCESS = theme.colors.success;
  const WARNING = theme.colors.warning;
  const ERROR = theme.colors.error;
  const INFO = theme.colors.info;
  const BORDER = theme.colors.border;
  const TEXT_SEC = theme.colors.textSecondary;

  const tickStyle = { fontSize: 11, fill: TEXT_SEC };

  return (
    <Container>
      {/* ── Header / Filters ── */}
      <Header>
        <Title>{t('reports.analytics')}</Title>

        <FilterRow>
          <PresetSelect
            options={presetOptions}
            value={preset}
            onChange={(e) => setPreset(e.target.value as DatePreset)}
          />
          {preset === 'custom' && (
            <>
              <DateInput
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <DateSep>—</DateSep>
              <DateInput
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </>
          )}
          {knownTerminals.length > 1 && (
            <Select
              options={[
                { value: '', label: t('reports.allTerminals') },
                ...knownTerminals.map((id) => ({ value: id, label: id })),
              ]}
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
            />
          )}
        </FilterRow>
      </Header>

      {isLoading && <LoadingText>{t('common.loading')}</LoadingText>}

      {data && (
        <>
          {/* ── KPI summary ── */}
          <KpiGrid>
            <KpiCard>
              <KpiLabel>{t('reports.totalRevenue')}</KpiLabel>
              <KpiValue>{fmt(data.summary.totalRevenue)}</KpiValue>
            </KpiCard>
            <KpiCard>
              <KpiLabel>{t('reports.totalSales')}</KpiLabel>
              <KpiValue>{data.summary.totalSales}</KpiValue>
            </KpiCard>
            <KpiCard>
              <KpiLabel>{t('reports.averageTransaction')}</KpiLabel>
              <KpiValue>{fmt(data.summary.averageTransaction)}</KpiValue>
            </KpiCard>
            <KpiCard>
              <KpiLabel>
                {t('reports.cashPayments')} / {t('reports.cardPayments')}
              </KpiLabel>
              <KpiValue>
                {data.summary.cashSales} / {data.summary.cardSales}
              </KpiValue>
            </KpiCard>
          </KpiGrid>

          {/* ── Sales Trend (full width) ── */}
          <Card>
            <CardTitle>{t('reports.salesTrend')}</CardTitle>
            {data.salesTrend.length === 0 ? (
              <NoData>{t('reports.noData')}</NoData>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={data.salesTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="date" tick={tickStyle} />
                  <YAxis
                    tickFormatter={(v: number) => fmt(v)}
                    tick={tickStyle}
                    width={100}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [fmt(v ?? 0), t('reports.revenue')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={PRIMARY}
                    fill={PRIMARY + '33'}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* ── Hourly | By Category ── */}
          <TwoCol>
            <Card>
              <CardTitle>{t('reports.hourlyDistribution')}</CardTitle>
              {data.hourlyDistribution.length === 0 ? (
                <NoData>{t('reports.noData')}</NoData>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={data.hourlyDistribution}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h: number) => `${h}:00`}
                      tick={tickStyle}
                    />
                    <YAxis tick={tickStyle} />
                    <Tooltip
                      formatter={(v: number | undefined) => [v ?? 0, t('reports.transactions')]}
                      labelFormatter={(h) => `${h}:00 – ${(Number(h) + 1) % 24}:00`}
                    />
                    <Bar dataKey="count" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <CardTitle>{t('reports.salesByCategory')}</CardTitle>
              {categoryData.length === 0 ? (
                <NoData>{t('reports.noData')}</NoData>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={categoryData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => fmt(v)}
                      tick={tickStyle}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={tickStyle}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [fmt(v ?? 0), t('reports.revenue')]}
                    />
                    <Bar dataKey="revenue" fill={INFO} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </TwoCol>

          {/* ── Top Products | Cashier Performance ── */}
          <TwoCol>
            <Card>
              <CardTitle>{t('reports.topSellingProducts')}</CardTitle>
              {data.topProducts.length === 0 ? (
                <NoData>{t('reports.noData')}</NoData>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={data.topProducts}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis type="number" tick={tickStyle} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={tickStyle}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [v ?? 0, t('reports.items')]}
                    />
                    <Bar dataKey="quantity" fill={SUCCESS} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <CardTitle>{t('reports.cashierPerformance')}</CardTitle>
              {data.cashierPerformance.length === 0 ? (
                <NoData>{t('reports.noData')}</NoData>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={data.cashierPerformance}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="name" tick={tickStyle} />
                    <YAxis
                      tickFormatter={(v: number) => fmt(v)}
                      tick={tickStyle}
                      width={100}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [fmt(v ?? 0), t('reports.revenue')]}
                    />
                    <Bar dataKey="revenue" fill={WARNING} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </TwoCol>

          {/* ── Profit Margins (full width) ── */}
          <Card>
            <CardTitle>{t('reports.profitMargins')}</CardTitle>
            {profitData.length === 0 ? (
              <NoData>{t('reports.noData')}</NoData>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={profitData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="name" tick={tickStyle} />
                  <YAxis
                    tickFormatter={(v: number) => fmt(v)}
                    tick={tickStyle}
                    width={100}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [fmt(v ?? 0), '']}
                  />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    name={t('reports.revenue')}
                    fill={PRIMARY}
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="cost"
                    name={t('reports.cost')}
                    fill={ERROR}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}

      {!isLoading && !data && (
        <NoData>{t('reports.noData')}</NoData>
      )}
    </Container>
  );
}
