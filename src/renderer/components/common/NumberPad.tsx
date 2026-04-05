import React from "react";
import styled from "styled-components";
import { Delete, Plus, Trash2 } from "lucide-react";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.xs};
`;

const NumKey = styled.button<{ $variant?: "action" | "clear" | "enter"; $span?: number }>`
  height: 52px;
  ${({ $span }) => $span && `grid-column: span ${$span};`}
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}15;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:active {
    transform: scale(0.95);
    background-color: ${({ theme }) => theme.colors.primary}30;
  }

  ${({ $variant, theme }) =>
    $variant === "action" &&
    `
    background-color: ${theme.colors.primary}10;
    border-color: ${theme.colors.primary}50;
    color: ${theme.colors.primary};
    font-size: 14px;
    &:hover { background-color: ${theme.colors.primary}20; }
  `}

  ${({ $variant, theme }) =>
    $variant === "clear" &&
    `
    background-color: ${theme.colors.error}10;
    border-color: ${theme.colors.error}50;
    color: ${theme.colors.error};
    font-size: 14px;
    &:hover { background-color: ${theme.colors.error}20; }
  `}

  ${({ $variant, theme }) =>
    $variant === "enter" &&
    `
    background-color: ${theme.colors.success};
    border-color: ${theme.colors.success};
    color: white;
    font-size: 20px;
    &:hover { opacity: 0.9; background-color: ${theme.colors.success}; }
  `}
`;

interface NumberPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  enterLabel?: React.ReactNode;
}

/**
 * Reusable numeric keypad for touchscreen input.
 * Layout (4 cols × 4 rows):
 *   7  8  9  ⌫
 *   4  5  6  CLR
 *   1  2  3  .
 *   00 0  [Enter ×2]
 *
 * Uses onMouseDown preventDefault to keep focus on the associated input.
 */
export function NumberPad({
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  enterLabel = <Plus size={36} />,
}: NumberPadProps) {
  return (
    <Grid onMouseDown={(e) => e.preventDefault()}>
      {["7", "8", "9"].map((d) => (
        <NumKey key={d} type="button" tabIndex={-1} onClick={() => onDigit(d)}>
          {d}
        </NumKey>
      ))}
      <NumKey $variant="action" type="button" tabIndex={-1} onClick={onBackspace}>
        <Delete size={18} />
      </NumKey>

      {["4", "5", "6"].map((d) => (
        <NumKey key={d} type="button" tabIndex={-1} onClick={() => onDigit(d)}>
          {d}
        </NumKey>
      ))}
      <NumKey $variant="clear" type="button" tabIndex={-1} onClick={onClear}>
        <Trash2 size={18} />
      </NumKey>

      {["1", "2", "3"].map((d) => (
        <NumKey key={d} type="button" tabIndex={-1} onClick={() => onDigit(d)}>
          {d}
        </NumKey>
      ))}
      <NumKey $variant="action" type="button" tabIndex={-1} onClick={() => onDigit(".")}>
        .
      </NumKey>

      <NumKey type="button" tabIndex={-1} onClick={() => onDigit("00")}>
        00
      </NumKey>
      <NumKey type="button" tabIndex={-1} onClick={() => onDigit("0")}>
        0
      </NumKey>
      <NumKey $variant="enter" $span={2} type="button" tabIndex={-1} onClick={onEnter}>
        {enterLabel}
      </NumKey>
    </Grid>
  );
}
