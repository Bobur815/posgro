import styled from "styled-components";
import { LogIn, Moon, Sun } from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL } from "../../config";
import { gradient } from "../../styles/brand";
import { IconBtn } from "../common/Buttons";

const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Brand = styled.a`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
  text-decoration: none;
  font-weight: 800;
  font-size: 19px;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
`;

const Mark = styled.span<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: -0.5px;
`;

const NavLink = styled.a`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
  @media (max-width: 860px) {
    display: none;
  }
`;

const LoginBtn = styled.a<{ $dark: boolean }>`
  ${({ $dark }) => gradient($dark)}
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-radius: 9px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  &:hover {
    opacity: 0.9;
  }
`;

export function Header() {
  const { t, ru, toggleLang, dark, toggleDark } = useLanding();

  return (
    <Bar>
      <Brand href="/">
        <Mark $dark={dark}>PG</Mark>
        POSGRO
      </Brand>
      <NavLink href="#features">{t("nav.features")}</NavLink>
      <NavLink href="#pricing">{t("nav.pricing")}</NavLink>
      <NavLink href="#contact">{t("nav.contact")}</NavLink>
      <IconBtn onClick={toggleLang} title={t("lang.toggle")}>
        {ru ? "RU" : "UZ"}
      </IconBtn>
      <IconBtn onClick={toggleDark} title={t("theme.toggle")}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </IconBtn>
      <LoginBtn $dark={dark} href={DASHBOARD_URL}>
        <LogIn size={15} />
        {t("nav.login")}
      </LoginBtn>
    </Bar>
  );
}
