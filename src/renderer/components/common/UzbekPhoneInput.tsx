import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { digitsOnly, formatUzPhone, UZ_PREFIX } from '@shared/utils/phone';

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
  font-size: 16px;
  font-family: monospace;
  letter-spacing: 0.5px;
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

interface UzbekPhoneInputProps {
  label?: string;
  valueDigits: string;
  onDigitsChange: (digits: string) => void;
  error?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
  className?: string;
  disabled?: boolean;
}

function caretAfterToken(str: string, token: string, occurrence = 1): number | null {
  let from = 0;
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = str.indexOf(token, from);
    if (idx === -1) return null;
    from = idx + token.length;
  }
  return from;
}

export function UzbekPhoneInput({
  label,
  valueDigits,
  onDigitsChange,
  error,
  inputRef,
  onEnter,
  className,
  disabled,
}: UzbekPhoneInputProps) {
  const [display, setDisplay] = useState(valueDigits ? formatUzPhone(valueDigits) : '');
  const prevLenRef = useRef(digitsOnly(valueDigits).length);

  const ensureCaretAfterPrefix = (el: HTMLInputElement) => {
    const pos = Math.max(el.selectionStart ?? 0, UZ_PREFIX.length);
    requestAnimationFrame(() => el.setSelectionRange(pos, pos));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.target;
    if (!display) {
      const v = formatUzPhone('');
      setDisplay(v);
      requestAnimationFrame(() => el.setSelectionRange(v.length, v.length));
    } else {
      ensureCaretAfterPrefix(el);
    }
  };

  const handleBlur = () => {
    if (digitsOnly(display).length === 0) {
      setDisplay('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;

    if ((e.key === 'ArrowLeft' || e.key === 'Home') && start <= UZ_PREFIX.length) {
      e.preventDefault();
      ensureCaretAfterPrefix(el);
    }
    if (
      (e.key === 'Backspace' && start <= UZ_PREFIX.length) ||
      (e.key === 'Delete' && start < UZ_PREFIX.length)
    ) {
      e.preventDefault();
    }
    if (e.key === 'Enter') onEnter?.();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = digitsOnly(e.clipboardData.getData('text'));
    let current = digitsOnly(display);
    if (current.startsWith('998')) current = current.slice(3);
    const nextDigits = (current + pasted).slice(0, 9);
    onDigitsChange(nextDigits);
    setDisplay(formatUzPhone(nextDigits));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    let raw = digitsOnly(el.value);
    if (raw.startsWith('998')) raw = raw.slice(3);
    const trimmed = raw.slice(0, 9);

    const prevLen = prevLenRef.current;
    const nextLen = trimmed.length;

    onDigitsChange(trimmed);
    const nextDisplay = formatUzPhone(trimmed);
    setDisplay(nextDisplay);

    let targetPos: number | null = null;
    if (prevLen === 1 && nextLen === 2) targetPos = caretAfterToken(nextDisplay, ') ', 1);
    else if (prevLen === 4 && nextLen === 5) targetPos = caretAfterToken(nextDisplay, '-', 1);
    else if (prevLen === 6 && nextLen === 7) targetPos = caretAfterToken(nextDisplay, '-', 2);

    if (targetPos != null) {
      requestAnimationFrame(() => el.setSelectionRange(targetPos!, targetPos!));
    } else {
      const min = UZ_PREFIX.length;
      const pos = Math.max(el.selectionStart ?? min, min);
      requestAnimationFrame(() => el.setSelectionRange(pos, pos));
    }

    prevLenRef.current = nextLen;
  };

  return (
    <Container className={className}>
      {label && <Label>{label}</Label>}
      <StyledInput
        $hasError={Boolean(error)}
        value={display}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={handleChange}
        inputMode="numeric"
        autoComplete="tel"
        placeholder="+998 (XX) XXX-XX-XX"
        ref={inputRef as React.RefObject<HTMLInputElement>}
        disabled={disabled}
        autoFocus
      />
      {error && <ErrorText>{error}</ErrorText>}
    </Container>
  );
}

export { isUzPhoneComplete } from '@shared/utils/phone';
