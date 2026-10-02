import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Category } from "@shared/types";
import { CardBody, CardButton, CardName, CardPicture } from "./PictureCard";

/** Category tiles, auto-filled to the width available (same columns as ProductGrid). */
export const CategoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: min-content;
  align-content: start;
  gap: ${({ theme }) => theme.spacing.sm};
`;

/**
 * One row of fixed-width category tiles that scrolls sideways, for places where a full grid would
 * push the content below it out of view (the POS catalog header).
 */
export const CategoryStrip = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 120px;
  align-items: stretch;
  gap: ${({ theme }) => theme.spacing.xs};
  overflow-x: auto;
  overscroll-behavior-x: contain;
  /* Room for the focus ring and hover lift, which overflow would otherwise clip. */
  padding: 4px 4px 6px;
  min-width: 0;
`;

/** The fields a card needs — the catalog's top-categories list carries only these. */
export type CategoryCardData = Pick<Category, "id" | "nameRu" | "nameUz">;

interface CategoryCardProps {
  category: CategoryCardData;
  /** Pass a stable callback (useCallback) — the card is memoized. */
  onClick: (category: CategoryCardData) => void;
  selected?: boolean;
  /** Picture URL; leave undefined when pictures are off and the card has no picture area at all. */
  pictureSrc?: string;
}

function CategoryCardComponent({ category, onClick, selected, pictureSrc }: CategoryCardProps) {
  const { i18n } = useTranslation();
  const name = i18n.language === "uz" ? category.nameUz || category.nameRu : category.nameRu;

  return (
    <CardButton
      type="button"
      $selected={selected}
      aria-pressed={selected}
      title={name}
      onClick={() => onClick(category)}
    >
      {pictureSrc !== undefined && <CardPicture src={pictureSrc} />}
      <CardBody>
        <CardName>{name}</CardName>
      </CardBody>
    </CardButton>
  );
}

export const CategoryCard = React.memo(CategoryCardComponent);
