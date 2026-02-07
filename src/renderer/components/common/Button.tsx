import React from 'react';
import styled, { css } from 'styled-components';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
  tooltip?: string;
}

const StyledButton = styled.button<{
  $variant: string;
  $size: string;
  $fullWidth: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;

  ${({ $fullWidth }) =>
    $fullWidth &&
    css`
      width: 100%;
    `}

  ${({ $size, theme }) => {
    switch ($size) {
      case 'small':
        return css`
          padding: ${theme.spacing.xs} ${theme.spacing.sm};
          font-size: 14px;
        `;
      case 'large':
        return css`
          padding: ${theme.spacing.md} ${theme.spacing.xl};
          font-size: 18px;
        `;
      default:
        return css`
          padding: ${theme.spacing.sm} ${theme.spacing.md};
          font-size: 14px;
        `;
    }
  }}

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'secondary':
        return css`
          background-color: transparent;
          color: ${theme.colors.primary};
          border: 1px solid ${theme.colors.primary};

          &:hover:not(:disabled) {
            background-color: ${theme.colors.primary}10;
          }
        `;
      case 'danger':
        return css`
          background-color: ${theme.colors.error};
          color: white;

          &:hover:not(:disabled) {
            opacity: 0.9;
          }
        `;
      default:
        return css`
          background-color: ${theme.colors.primary};
          color: white;

          &:hover:not(:disabled) {
            opacity: 0.9;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
`;

export function Button({
  variant = 'primary',
  size = 'large',
  fullWidth = false,
  children,
  tooltip,
  ...props
}: ButtonProps) {
  return (
    <StyledButton
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      title={tooltip}
      {...props}
    >
      {children}
    </StyledButton>
  );
}
