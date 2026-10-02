import React from "react";
import styled from "styled-components";

/**
 * What a product/category shows when it has no picture or the picture failed to load: a neutral
 * block with an image glyph, sized by its parent (cards: 4/3 box; table: 40×40 thumbnail).
 */
const Block = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.border};

  svg {
    width: 40%;
    height: 40%;
    max-width: 48px;
    max-height: 48px;
  }
`;

export function PicturePlaceholder() {
  return (
    <Block aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
      </svg>
    </Block>
  );
}
