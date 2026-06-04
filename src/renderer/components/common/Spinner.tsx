import React from 'react';
import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Ring = styled.div<{ $size: number; $thickness: number; $color?: string }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  border: ${({ $thickness }) => $thickness}px solid currentColor;
  border-top-color: transparent;
  color: ${({ $color, theme }) => $color ?? theme.colors?.primary ?? '#6366f1'};
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
`;

const Wrapper = styled.div<{ $centered: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  ${({ $centered }) => $centered && 'padding: 12px;'}
`;

interface SpinnerProps {
  size?: number;
  thickness?: number;
  color?: string;
  centered?: boolean;
  className?: string;
}

export function Spinner({ size = 20, thickness = 2, color, centered = false, className }: SpinnerProps) {
  return (
    <Wrapper $centered={centered} className={className}>
      <Ring $size={size} $thickness={thickness} $color={color} />
    </Wrapper>
  );
}
