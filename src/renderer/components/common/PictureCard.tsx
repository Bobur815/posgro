import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { PicturePlaceholder } from "./PicturePlaceholder";

/**
 * Building blocks shared by ProductCard and CategoryCard so both read as one family: a button
 * shell (hover lift, press, focus ring, selected border), a full-width 4/3 picture with a
 * placeholder fallback, and a name clamped to two lines.
 *
 * Kept free of anything Electron-only: the web dashboard compiles components/common too, so the
 * caller builds the picture URL and passes it in.
 */

export const CardButton = styled.button<{ $selected?: boolean }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0;
  overflow: hidden;
  text-align: left;
  font: inherit;
  color: ${({ theme }) => theme.colors.text};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  /* Thicken the selected border without changing the card's size. */
  box-shadow: ${({ theme, $selected }) =>
    $selected ? `inset 0 0 0 1px ${theme.colors.primary}, ${theme.shadows.sm}` : theme.shadows.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    border-color 0.12s ease;
  -webkit-tap-highlight-color: transparent;

  /* Lift only where a real pointer hovers — on a touchscreen :hover would stick after a tap. */
  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: ${({ theme }) => theme.colors.primary};
      box-shadow: ${({ theme, $selected }) =>
        $selected
          ? `inset 0 0 0 1px ${theme.colors.primary}, ${theme.shadows.md}`
          : theme.shadows.md};
    }
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover:not(:disabled),
    &:active:not(:disabled) {
      transform: none;
    }
  }
`;

const Frame = styled.span<{ $dimmed?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  flex-shrink: 0;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  /* The picture or its placeholder — not a badge drawn over them. */
  > img,
  > span[aria-hidden] {
    opacity: ${({ $dimmed }) => ($dimmed ? 0.4 : 1)};
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

interface CardPictureProps {
  src: string;
  dimmed?: boolean;
  /** Drawn over the picture, e.g. the "out of stock" badge. */
  children?: React.ReactNode;
}

/** Full-width 4/3 picture; the placeholder stands in while there is none or it fails to load. */
export function CardPicture({ src, dimmed, children }: CardPictureProps) {
  const [failed, setFailed] = useState(false);
  // A new URL (another item, or a picture that just arrived) gets its own chance to load.
  useEffect(() => setFailed(false), [src]);

  return (
    <Frame $dimmed={dimmed}>
      {failed ? (
        <PicturePlaceholder />
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </Frame>
  );
}

export const CardBody = styled.span`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`;

export const CardName = styled.span`
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  color: ${({ theme }) => theme.colors.text};
`;
