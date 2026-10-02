import React, { useEffect, useState } from "react";
import styled from "styled-components";

/**
 * A product/category picture from posimg:, in a box that is the same size with or without one — so
 * a missing picture (404) or one still loading never shifts the row it sits in.
 */
const Box = styled.span<{ $size: number }>`
  flex-shrink: 0;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.surface};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

interface PictureProps {
  src: string;
  size: number;
}

export function Picture({ src, size }: PictureProps) {
  const [missing, setMissing] = useState(false);
  // A new URL (another product, or a picture that just arrived) gets its own chance to load.
  useEffect(() => setMissing(false), [src]);

  return (
    <Box $size={size} aria-hidden>
      {!missing && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setMissing(true)}
        />
      )}
    </Box>
  );
}
