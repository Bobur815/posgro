import styled from "styled-components";

export const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
`;

export const InputControls = styled.div`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
`;

export const ClearButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-radius: 50%;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.border};
  }
`;

export const KbToggle = styled.button<{ $active?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 1px;
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  border-radius: 4px;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primary}10;
  }
`;
