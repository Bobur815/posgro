import styled from "styled-components";
import { gradient } from "../../styles/brand";

export const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

export const PrimaryCta = styled.a<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 15px 30px;
  border-radius: 10px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  box-shadow: ${({ theme }) => theme.shadows.md};
  &:hover {
    opacity: 0.9;
  }
`;

export const SecondaryCta = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 15px 30px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;
