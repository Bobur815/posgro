import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 640px) {
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
`;

const Placeholder = styled.div`
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 2px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

export function Analytics() {
  const { t } = useTranslation();

  return (
    <Container>
      <Title>{t('reports.analytics')}</Title>
      <Grid>
        <Card><CardTitle>{t('reports.salesTrend')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
        <Card><CardTitle>{t('reports.salesByCategory')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
        <Card><CardTitle>{t('reports.hourlyDistribution')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
        <Card><CardTitle>{t('reports.topSellingProducts')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
        <Card><CardTitle>{t('reports.cashierPerformance')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
        <Card><CardTitle>{t('reports.profitMargins')}</CardTitle><Placeholder>{t('reports.chartPlaceholder')}</Placeholder></Card>
      </Grid>
    </Container>
  );
}
