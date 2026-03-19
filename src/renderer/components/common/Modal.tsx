import React from "react";
import styled from "styled-components";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContainer = styled.div<{ $width?: string }>`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  max-width: ${({ $width }) => $width || "500px"};
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const Header = styled.div`
  position: sticky;
  top: 0;
  background-color: ${({ theme }) => theme.colors.surface};
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 0;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.md};

  @media (max-width: 640px) {
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

export function Modal({ title, onClose, children, width }: ModalProps) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick}>
      <ModalContainer $width={width}>
        <Header>
          <Title>{title}</Title>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </Header>
        <Content>{children}</Content>
      </ModalContainer>
    </Overlay>
  );
}
