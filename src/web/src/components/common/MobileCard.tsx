import React from "react";
import styled from "styled-components";

export interface MobileCardField {
  label: string;
  value: React.ReactNode;
}

interface MobileCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  fields: MobileCardField[];
  actions?: React.ReactNode;
}

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const CardTitle = styled.div`
  font-weight: 600;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const CardSubtitle = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: -4px;
`;

const FieldsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`;

const FieldItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FieldLabel = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
`;

const FieldValue = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const CardActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.xs};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
`;

export function MobileCard({
  title,
  subtitle,
  fields,
  actions,
}: MobileCardProps) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
      <FieldsGrid>
        {fields.map((field, i) => (
          <FieldItem key={i}>
            <FieldLabel>{field.label}</FieldLabel>
            <FieldValue>{field.value}</FieldValue>
          </FieldItem>
        ))}
      </FieldsGrid>
      {actions && <CardActions>{actions}</CardActions>}
    </Card>
  );
}

export const MobileCardList = styled.div`
  display: none;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};

  @media (max-width: 768px) {
    display: flex;
  }
`;

export const DesktopOnly = styled.div`
  @media (max-width: 768px) {
    display: none;
  }
`;
