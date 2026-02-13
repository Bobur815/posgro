import React, { forwardRef, useState, useEffect, useRef } from 'react';
import styled from 'styled-components';

interface DateInputProps {
  label?: string;
  error?: string;
  value?: string; // YYYY-MM-DD
  onChange?: (isoDate: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
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

const StyledInput = styled.input<{ $hasError: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid
    ${({ theme, $hasError }) => ($hasError ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.colors.error : theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const ErrorText = styled.span`
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function displayToIso(display: string): string {
  const cleaned = display.replace(/\//g, '');
  if (cleaned.length !== 8) return '';
  const dd = cleaned.slice(0, 2);
  const mm = cleaned.slice(2, 4);
  const yyyy = cleaned.slice(4, 8);
  const d = parseInt(dd, 10);
  const m = parseInt(mm, 10);
  const y = parseInt(yyyy, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return '';
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return '';
  return `${yyyy}-${mm}-${dd}`;
}

function applyMask(raw: string, prevDisplay: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '/';
    result += digits[i];
  }
  return result;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, error, value = '', onChange, className, style, ...props }, ref) => {
    const [display, setDisplay] = useState(() => isoToDisplay(value));
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      setDisplay(isoToDisplay(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = applyMask(e.target.value, display);
      setDisplay(masked);

      const iso = displayToIso(masked);
      if (iso) {
        onChange?.(iso);
      } else if (masked === '') {
        onChange?.('');
      }
    };

    const handleRef = (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    };

    return (
      <Container className={className}>
        {label && <Label>{label}</Label>}
        <StyledInput
          $hasError={Boolean(error)}
          ref={handleRef}
          value={display}
          onChange={handleChange}
          placeholder="dd/mm/yyyy"
          style={style}
          {...props}
        />
        {error && <ErrorText>{error}</ErrorText>}
      </Container>
    );
  }
);
