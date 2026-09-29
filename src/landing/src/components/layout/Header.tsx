import styled, { css } from "styled-components";
import { LogIn, Moon, Sun } from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL } from "../../config";
import { gradient } from "../../styles/brand";
import { useScrollTrigger } from "../../hooks/useScrollTrigger";
import { IconBtn } from "../common/Buttons";

/** Fixed, so the hero can pull itself up under the bar by exactly this much. */
export const HEADER_H = 66;

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

/**
 * Transparent over the hero, with white text — the hero is always dark (video under an overlay, or
 * its gradient). A frosted surface with the theme's colours once the page scrolls under it.
 */
const Bar = styled.header<{ $scrolled: boolean }>`
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  height: ${HEADER_H}px;
  padding: 0 24px;
  border-bottom: 1px solid
    ${({ $scrolled, theme }) => ($scrolled ? theme.colors.border : "transparent")};
  background: ${({ $scrolled, theme }) =>
    $scrolled
      ? `color-mix(in oklab, ${theme.colors.surface} 72%, transparent)`
      : "transparent"};
  backdrop-filter: ${({ $scrolled }) => ($scrolled ? "blur(10px)" : "none")};
  -webkit-backdrop-filter: ${({ $scrolled }) => ($scrolled ? "blur(10px)" : "none")};
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    backdrop-filter 200ms ease;

  ${({ $scrolled }) =>
    !$scrolled &&
    css`
      ${Brand}, ${NavLink}, ${IconBtn} {
        color: #fff;
      }
      ${NavLink}:hover {
        color: rgba(255, 255, 255, 0.75);
      }
      ${IconBtn} {
        border-color: rgba(255, 255, 255, 0.4);
      }
    `}
`;

export function Header() {
  const { t, ru, toggleLang, dark, toggleDark } = useLanding();
  const scrolled = useScrollTrigger(10);

  return (
    <Bar $scrolled={scrolled}>
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
