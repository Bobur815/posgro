import styled from "styled-components";
import { POSGROIcon } from "./logos";
import { BRAND_NAME } from "./constants";

/**
 * The POSGRO mark in the top-left corner of the login page's banner, drawn over whatever image is
 * uploaded on the Login Banner page — so no image has to carry the logo itself, and every future
 * one gets it without editing.
 *
 * Always the light-theme mark with white lettering: it sits on a photo, not on the app's surface.
 * A soft scrim behind it keeps the lettering readable over a pale sky.
 *
 * `compact` is the admin page's preview, about a third the size of the real panel. The POS
 * terminal draws the same mark in `renderer/pages/Login/PinLoginPage.tsx`.
 */
const Bar = styled.div<{ $compact?: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "8px" : "14px")};
  padding: ${({ $compact }) => ($compact ? "14px 16px 28px" : "32px 32px 64px")};
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35) 0%, transparent 100%);
  pointer-events: none;
`;

const Name = styled.span<{ $compact?: boolean }>`
  font-size: ${({ $compact }) => ($compact ? "16px" : "30px")};
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
`;

export function BannerBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Bar $compact={compact} aria-hidden="true">
      <POSGROIcon theme="light" size={compact ? 28 : 56} />
      <Name $compact={compact}>{BRAND_NAME}</Name>
    </Bar>
  );
}
