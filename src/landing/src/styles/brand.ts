import { css } from "styled-components";

/**
 * The brand mark: the same gradient square and "PG" as the app icon (src/web/src/branding).
 * The landing is light-only; `onDark` is the paler pair for text over the hero's dark overlay.
 */
export const BRAND = {
  from: "#1976d2",
  to: "#dc004e",
  onDark: { from: "#90caf9", to: "#f48fb1" },
};

export const gradient = css`
  background: linear-gradient(135deg, ${BRAND.from} 0%, ${BRAND.to} 100%);
`;

export const gradientOnDark = css`
  background: linear-gradient(
    135deg,
    ${BRAND.onDark.from} 0%,
    ${BRAND.onDark.to} 100%
  );
`;

/**
 * The theme's info blue, as a supporting accent: fills, icons, borders and focus rings. White
 * text on `main` is only 3.1:1, so small text on blue (or blue text) uses `text` (4.6:1).
 */
export const INFO = {
  main: "#2196f3",
  text: "#1976d2",
  tint: "#e3f2fd",
  ring: "rgba(33, 150, 243, 0.2)",
};

/** The hero without a video (none uploaded, or the poster failed): a deep brand gradient, so the
 *  white headline reads the same as over the video. */
export const HERO_FALLBACK =
  "linear-gradient(135deg, #0b1f3a 0%, #1a1440 55%, #3b0d24 100%)";
