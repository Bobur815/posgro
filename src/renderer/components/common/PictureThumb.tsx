import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { PicturePlaceholder } from "./PicturePlaceholder";

/** A 40×40 table thumbnail; the same placeholder as the cards stands in for a missing picture. */
const Box = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  overflow: hidden;
  vertical-align: middle;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.background};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export function PictureThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <Box>
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
    </Box>
  );
}
