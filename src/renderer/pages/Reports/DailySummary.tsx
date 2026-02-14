import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useSales } from '../../hooks/useSales';
import { formatCurrency as formatCurrencyBase } from '@shared/utils';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const StatValue = styled.div`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
`;

const StatSubtext = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

interface Summary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalItems: number;
  cashSales: number;
  cardSales: number;
  averageTransaction: number;
}

export function DailySummary() {
  const { t, i18n } = useTranslation();
  const { getTodaySummary, isLoading } = useSales();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    const data = await getTodaySummary();
    setSummary(data);
  };

  const formatCurrency = (amount: number) => formatCurrencyBase(amount, i18n.language as 'ru' | 'uz');

  if (isLoading) {
    return <div>{t('common.loading')}</div>;
  }

  return (
    <Container>
      <Title>{t('reports.dailySummary')}</Title>

      {summary && (
        <StatsGrid>
          <StatCard>
            <StatLabel>{t('reports.totalSales')}</StatLabel>
            <StatValue>{summary.totalSales}</StatValue>
            <StatSubtext>{t('reports.transactions')}</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t('reports.totalRevenue')}</StatLabel>
            <StatValue>{formatCurrency(summary.totalRevenue)}</StatValue>
            <StatSubtext>{summary.date}</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t('reports.averageTransaction')}</StatLabel>
            <StatValue>{formatCurrency(summary.averageTransaction)}</StatValue>
            <StatSubtext>{t('reports.perSale')}</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t('reports.itemsSold')}</StatLabel>
            <StatValue>{summary.totalItems}</StatValue>
            <StatSubtext>{t('reports.items')}</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t('reports.cashPayments')}</StatLabel>
            <StatValue>{summary.cashSales}</StatValue>
            <StatSubtext>{t('reports.transactions')}</StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t('reports.cardPayments')}</StatLabel>
            <StatValue>{summary.cardSales}</StatValue>
            <StatSubtext>{t('reports.transactions')}</StatSubtext>
          </StatCard>
        </StatsGrid>
      )}
    </Container>
  );
}
