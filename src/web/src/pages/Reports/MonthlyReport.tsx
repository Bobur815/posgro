import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '@components/common/Button';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const FilterRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const ReportSection = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SectionTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
`;

const Placeholder = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MonthlyReport() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleGenerateReport = () => {
    console.log(`Generating report for ${months[selectedMonth]} ${selectedYear}`);
  };

  return (
    <Container>
      <Title>{t('reports.monthlyReport')}</Title>
      <FilterRow>
        <Select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
          {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
        </Select>
        <Select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </Select>
        <Button onClick={handleGenerateReport}>{t('reports.generateReport')}</Button>
      </FilterRow>
      <ReportSection>
        <SectionTitle>{t('reports.salesOverview')}</SectionTitle>
        <Placeholder>{t('reports.selectPeriod')}</Placeholder>
      </ReportSection>
      <ReportSection>
        <SectionTitle>{t('reports.topProducts')}</SectionTitle>
        <Placeholder>{t('reports.selectPeriod')}</Placeholder>
      </ReportSection>
      <ReportSection>
        <SectionTitle>{t('reports.revenueByCategory')}</SectionTitle>
        <Placeholder>{t('reports.selectPeriod')}</Placeholder>
      </ReportSection>
    </Container>
  );
}
