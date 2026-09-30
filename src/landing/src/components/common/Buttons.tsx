import styled from "styled-components";
import { gradient, INFO } from "../../styles/brand";

export const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  /* Full text colour, not textSecondary: the 13px "UZ/RU" label has to read on the glass header. */
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background-color 150ms ease;
  &:hover {
    color: ${INFO.text};
    border-color: ${INFO.main};
    background: ${INFO.tint};
  }
`;

export const PrimaryCta = styled.a`
  ${gradient}
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
  /* Also rendered as a <button> (the hero's lead form) — reset what a button brings along. */
  border: none;
  font-family: inherit;
  cursor: pointer;
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
