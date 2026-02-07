import React from 'react';
import styled from 'styled-components';

interface EmptyPlaceholderProps {
  icon: JSX.Element;
  title: string;
  description?: string;
}

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  gap: ${({ theme }) => theme.spacing.md};
`;

const Icon = styled.span`
  font-size: 48px;
  opacity: 0.5;
`;

const Title = styled.span`
  font-size: 18px;
  font-weight: 600;
`;

const Description = styled.span`
  font-size: 14px;
  opacity: 0.7;
`;

export function EmptyPlaceholder({ icon, title, description }: EmptyPlaceholderProps) {
  return (
    <Container>
      <Icon>{icon}</Icon>
      <Title>{title}</Title>
      {description && <Description>{description}</Description>}
    </Container>
  );
}
