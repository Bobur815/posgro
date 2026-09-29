import { css } from "styled-components";

/** The brand mark: the same gradient square and "PG" as the app icon (src/web/src/branding). */
export const BRAND = {
  light: { from: "#1976d2", to: "#dc004e" },
  dark: { from: "#90caf9", to: "#f48fb1" },
};

export const gradient = (dark: boolean) => css`
  background: linear-gradient(
    135deg,
    ${dark ? BRAND.dark.from : BRAND.light.from} 0%,
    ${dark ? BRAND.dark.to : BRAND.light.to} 100%
  );
`;
