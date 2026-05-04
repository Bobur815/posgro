import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { POSGROSquare } from '../branding';
import { useTheme } from '../theme/ThemeProvider';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(0.98); }
`;

const LoadingContainer = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
`;

const LogoWrapper = styled.div`
  animation: ${pulse} 2s ease-in-out infinite;
`;

const LoadingText = styled.div`
  margin-top: 32px;
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProgressBar = styled.div`
  width: 200px;
  height: 3px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  margin-top: 16px;
  overflow: hidden;
`;

const Progress = styled.div<{ $progress: number }>`
  width: ${({ $progress }) => $progress}%;
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #dc004e);
  transition: width 0.3s ease;
`;

export const LoadingScreen: React.FC<{ onComplete?: () => void }> = ({
  onComplete,
}) => {
  const { mode } = useTheme();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          if (onComplete) setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <LoadingContainer>
      <LogoWrapper>
        <POSGROSquare theme={mode} size={250} />
      </LogoWrapper>
      <LoadingText>Загрузка системы...</LoadingText>
      <ProgressBar>
        <Progress $progress={progress} />
      </ProgressBar>
    </LoadingContainer>
  );
};
