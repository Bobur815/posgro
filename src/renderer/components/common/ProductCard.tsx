import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Product } from "@shared/types";
import { formatCurrency } from "@shared/utils";
import { formatQuantity } from "../../utils/formatters";
import { CardBody, CardButton, CardName, CardPicture } from "./PictureCard";

/** Product tiles, auto-filled to the width available. */
export const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  /* Rows keep their natural height, packed at the top — otherwise align-content: stretch
     balloons a sparse row to fill a flex parent's height. */
  grid-auto-rows: min-content;
  align-content: start;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Footer = styled.span`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: auto;
`;

const Stock = styled.span<{ $low: boolean }>`
  font-size: 12px;
  white-space: nowrap;
  color: ${({ theme, $low }) => ($low ? theme.colors.warning : theme.colors.textSecondary)};
  font-weight: ${({ $low }) => ($low ? 600 : 400)};
`;

const Price = styled.span`
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.primary};
`;

const OutOfStockBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.error};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.error};
`;

const OverPicture = styled.span`
  position: absolute;
  top: ${({ theme }) => theme.spacing.xs};
  left: ${({ theme }) => theme.spacing.xs};
`;

interface ProductCardProps {
  product: Product;
  /** Pass a stable callback (useCallback) — the card is memoized for grids of hundreds. */
  onClick: (product: Product) => void;
  selected?: boolean;
  /** Picture URL; leave undefined when pictures are off and the card has no picture area at all. */
  pictureSrc?: string;
}

function ProductCardComponent({ product, onClick, selected, pictureSrc }: ProductCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "uz" ? "uz" : "ru";
  const name = locale === "uz" ? product.nameUz || product.nameRu : product.nameRu;
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.minStock;
  const badge = <OutOfStockBadge>{t("products.outOfStock")}</OutOfStockBadge>;

  return (
    <CardButton
      type="button"
      $selected={selected}
      aria-pressed={selected}
      disabled={outOfStock}
      title={name}
      onClick={() => onClick(product)}
    >
      {pictureSrc !== undefined && (
        <CardPicture src={pictureSrc} dimmed={outOfStock}>
          {outOfStock && <OverPicture>{badge}</OverPicture>}
        </CardPicture>
      )}
      <CardBody>
        <CardName>{name}</CardName>
        <Footer>
          {outOfStock && pictureSrc === undefined ? (
            badge
          ) : (
            <Stock $low={lowStock} title={lowStock ? t("products.lowStock") : undefined}>
              {formatQuantity(product.stock, product.unit || "шт", locale)}
            </Stock>
          )}
          <Price>{formatCurrency(product.price, locale)}</Price>
        </Footer>
      </CardBody>
    </CardButton>
  );
}

export const ProductCard = React.memo(ProductCardComponent);
