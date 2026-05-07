import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { RefreshCw } from 'lucide-react';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Btn = styled.button<{ $syncing?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  padding: 0;
  cursor: ${({ $syncing }) => ($syncing ? 'default' : 'pointer')};
  color: ${({ theme, $syncing }) =>
    $syncing ? theme.colors.warning : theme.colors.textSecondary};
  transition: background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.primary};
  }

  &:active:not(:disabled) {
    transform: scale(0.9);
  }

  svg {
    animation: ${({ $syncing }) => ($syncing ? spin : 'none')} 1s linear infinite;
  }
`;

interface SyncButtonProps {
  onSync: () => Promise<void>;
  size?: number;
  title?: string;
  className?: string;
}

export function SyncButton({ onSync, size = 17, title, className }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const handleClick = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Btn
      $syncing={syncing}
      disabled={syncing}
      onClick={handleClick}
      title={title}
      className={className}
    >
      <RefreshCw size={size} />
    </Btn>
  );
}
