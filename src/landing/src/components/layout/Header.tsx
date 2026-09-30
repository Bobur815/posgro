import styled from "styled-components";
import { LogIn } from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL } from "../../config";
import { gradient, INFO } from "../../styles/brand";
import { useHideOnScroll } from "../../hooks/useHideOnScroll";
import { linkTo, matchRoute, usePathname } from "../../router";
import { IconBtn } from "../common/Buttons";

/** Fixed: the hero subtracts it from its height, and the hide-on-scroll threshold uses it. */
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

const Mark = styled.span`
  ${gradient}
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

/** Hover: the info blue as text (#1976d2, 4.6:1) with a #2196f3 underline drawn under it. */
const NavLink = styled.a`
  position: relative;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: color 150ms ease;
  &::after {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 3px;
    height: 2px;
    border-radius: 1px;
    background: ${INFO.main};
    transform: scaleX(0);
    transition: transform 150ms ease;
  }
  &:hover {
    color: ${INFO.text};
  }
  &:hover::after {
    transform: scaleX(1);
  }
  @media (max-width: 860px) {
    display: none;
  }
`;

const LoginBtn = styled.a`
  ${gradient}
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
 * Full width, frosted white glass; its content sits in BarContainer, lined up with the page
 * content. Always sticky, but slides out of view while scrolling down and back in on the first
 * scroll up.
 */
const Bar = styled.header<{ $hidden: boolean }>`
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: ${HEADER_H}px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%); /* Safari / iOS */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  /* Extra 8px so the shadow doesn't peek out below the viewport's top edge. */
  transform: translateY(
    ${({ $hidden }) => ($hidden ? "calc(-100% - 8px)" : "0")}
  );
  transition: transform 220ms ease;

  /* Keyboard users tabbing into a hidden bar still get to see it. */
  &:focus-within {
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const BarContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1032px; /* Main's 1080 minus its 24px gutters — the Features grid's width */
  margin: 0 auto;
`;

export function Header() {
  const { t, ru, toggleLang } = useLanding();
  const hidden = useHideOnScroll(HEADER_H);
  // Section anchors only exist on the home page; from /news they go home first (a normal load).
  const home = matchRoute(usePathname()).page === "home";
  const section = (id: string) => (home ? `#${id}` : `/#${id}`);

  return (
    <Bar $hidden={hidden}>
      <BarContainer>
        <Brand href="/" onClick={home ? undefined : linkTo("/")}>
          <Mark>PG</Mark>
          POSGRO
        </Brand>
        <NavLink href={section("features")}>{t("nav.features")}</NavLink>
        <NavLink href={section("pricing")}>{t("nav.pricing")}</NavLink>
        <NavLink href="/news" onClick={linkTo("/news")}>
          {t("nav.blog")}
        </NavLink>
        <NavLink href={section("contact")}>{t("nav.contact")}</NavLink>
        <IconBtn onClick={toggleLang} title={t("lang.toggle")}>
          {ru ? "RU" : "UZ"}
        </IconBtn>
        <LoginBtn href={DASHBOARD_URL}>
          <LogIn size={15} />
          {t("nav.login")}
        </LoginBtn>
      </BarContainer>
    </Bar>
  );
}
