import styled from "styled-components";
import clickLight from "../../assets/click-logo-light.png";
import clickDark from "../../assets/click-logo-dark.png";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * The Click wordmark, in the artwork for the current theme: black lettering on a transparent
 * ground in light mode, white lettering on black in dark mode. The two files are trimmed copies of
 * the brand originals (assets/Click-light_no_background.png, assets/click_dark_background.jpg) —
 * those carry a wide square margin that would shrink the mark to nothing inside a tile.
 *
 * The dark artwork has a solid black ground of its own, so the tile behind it must be black too
 * (CLICK_FIELD), or it shows as a black box. Purely decorative: the button carries the name.
 */
export const CLICK_FIELD = { light: "#ffffff", dark: "#000000" } as const;

const Img = styled.img<{ $height: number }>`
  display: block;
  height: ${({ $height }) => $height}px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
`;

export function ClickLogo({ height = 32 }: { height?: number }) {
  const { mode } = useTheme();
  return <Img src={mode === "dark" ? clickDark : clickLight} alt="" aria-hidden $height={height} />;
}
