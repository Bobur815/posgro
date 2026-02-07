import React, { forwardRef } from 'react';
import styled from 'styled-components';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  selectSize?: 'small' | 'medium';
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

const StyledSelect = styled.select<{ $hasError: boolean; $selectSize?: string }>`
  padding: ${({ theme, $selectSize }) =>
    $selectSize === 'small' ? theme.spacing.xs : theme.spacing.sm};
  border: 1px solid
    ${({ theme, $hasError }) => ($hasError ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ $selectSize }) => ($selectSize === 'small' ? '13px' : '14px')};
  transition: border-color 0.2s;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.colors.error : theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, selectSize = 'medium', className, ...props }, ref) => {
    return (
      <Container className={className}>
        {label && <Label>{label}</Label>}
        <StyledSelect $hasError={Boolean(error)} $selectSize={selectSize} ref={ref} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </StyledSelect>
        {error && <ErrorText>{error}</ErrorText>}
      </Container>
    );
  }
);
