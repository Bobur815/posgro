import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useProducts } from "../../hooks/useProducts";
import { Input } from "../../components/common/Input";
import { Product, ProductFilterParams } from "@shared/types";
import { ChevronDown, ChevronUp, Keyboard, X } from "lucide-react";
import { VirtualKeyboard } from "../../components/common/VirtualKeyboard";
import {
  SearchInputWrapper,
  InputControls,
  ClearButton,
  KbToggle,
} from "../../components/common/SearchControls";
import { debounce } from "../../utils/helpers";
import { productRequiresMarking } from "../../../shared/utils/marking";
import { ProductCard, ProductGrid } from "../../components/common/ProductCard";
import {
  CategoryCard,
  CategoryCardData,
  CategoryStrip,
} from "../../components/common/CategoryCard";
import { useSettingsStore } from "../../store/settings-store";
import { usePictureStore } from "../../store/picture-store";
import { useMxikPictureFill } from "../../hooks/useMxikPictureFill";
import { categoryPictureUrl, productPictureUrl } from "../../utils/pictures";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const SearchHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  position: relative;
`;

const SearchRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const PriceField = styled.input`
  width: 120px;
  flex-shrink: 0;
  padding: 10px 12px;
  font-size: 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const CategoryBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  align-items: center;
`;

const CategoryStripScroll = styled(CategoryStrip)`
  flex: 1;
`;

const CategorySelect = styled.select<{ $active?: boolean }>`
  flex: 0 0 200px;
  min-width: 0;
  min-height: 44px;
  padding: 6px 10px;
  font-size: 13px;
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary + "12" : theme.colors.background};
  color: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.text)};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ProductsScroll = styled(ProductGrid)`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const NoResults = styled.div`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};
  grid-column: 1 / -1;
`;

interface ProductSearchProps {
  onSelect: (product: Product) => void;
  // Raise the on-screen keyboard above a host modal (e.g. the Catalog modal, overlay z-index 1000).
  keyboardZIndex?: number;
}

export function ProductSearch({ onSelect, keyboardZIndex }: ProductSearchProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [priceQuery, setPriceQuery] = useState("");
  // Which text field the on-screen keyboard types into.
  const [activeField, setActiveField] = useState<"search" | "price">("search");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [topCategories, setTopCategories] = useState<
    { id: number; nameRu: string; nameUz: string }[]
  >([]);
  const [topSelling, setTopSelling] = useState<Product[]>([]);
  // Closed until the keyboard button is pressed — the panel never appears on its own.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const showPictures = useSettingsStore((s) => s.showProductImages);
  const mxikVersions = usePictureStore((s) => s.mxikVersions);
  const ownVersion = usePictureStore((s) => s.ownVersion);
  const {
    products,
    categories,
    loadProducts,
    loadCategories,
    getTopSelling,
    getTopCategories,
    isLoading,
  } = useProducts();

  // Load top-selling products + the 5 top-selling categories + the full list (for the dropdown).
  useEffect(() => {
    getTopSelling().then((data) => setTopSelling(data as unknown as Product[]));
    getTopCategories(5).then(setTopCategories);
    loadCategories();
  }, [getTopSelling, getTopCategories, loadCategories]);

  const debouncedLoad = useMemo(
    () =>
      debounce((query: string, categoryId: number | null, price: string) => {
        const exactPrice = price.trim() ? Number(price) : null;
        if (query.trim() || categoryId != null || exactPrice != null) {
          const params: ProductFilterParams = {};
          if (query.trim()) params.query = query;
          if (categoryId != null) params.categoryId = categoryId;
          // Exact price match — set both bounds to the same value.
          if (exactPrice != null && !Number.isNaN(exactPrice)) {
            params.priceMin = exactPrice;
            params.priceMax = exactPrice;
          }
          loadProducts(params);
        }
      }, 300),
    [loadProducts],
  );

  useEffect(() => {
    debouncedLoad(searchQuery, selectedCategoryId, priceQuery);
  }, [searchQuery, selectedCategoryId, priceQuery, debouncedLoad]);

  // Refresh products when stock changes (after sale/edit/delete)
  useEffect(() => {
    const refresh = () => {
      getTopSelling().then((data) =>
        setTopSelling(data as unknown as Product[]),
      );
      const exactPrice = priceQuery.trim() ? Number(priceQuery) : null;
      if (searchQuery.trim() || selectedCategoryId != null || exactPrice != null) {
        const params: ProductFilterParams = {};
        if (searchQuery.trim()) params.query = searchQuery;
        if (selectedCategoryId != null) params.categoryId = selectedCategoryId;
        if (exactPrice != null && !Number.isNaN(exactPrice)) {
          params.priceMin = exactPrice;
          params.priceMax = exactPrice;
        }
        loadProducts(params);
      }
    };
    window.addEventListener("stock-updated", refresh);
    return () => window.removeEventListener("stock-updated", refresh);
  }, [getTopSelling, searchQuery, selectedCategoryId, priceQuery, loadProducts]);

  const categoryName = (c: { nameRu: string; nameUz: string }) =>
    i18n.language === "uz" ? c.nameUz || c.nameRu : c.nameRu;

  // Marked goods (MXIK group 022) are hidden per-product from the catalog below — they require a
  // QR scan — so categories are no longer excluded wholesale (a category's group list spans many
  // groups and doesn't imply its products are marked).
  const visibleTopCategories = topCategories;

  // Categories not already shown as a top-5 button — offered in the dropdown.
  const topCategoryIds = new Set(visibleTopCategories.map((c) => c.id));
  const otherCategories = categories.filter(
    (c) => !topCategoryIds.has(Number(c.id)),
  );
  const selectedIsOther =
    selectedCategoryId != null && !topCategoryIds.has(selectedCategoryId);
  // Tapping the selected category again clears the filter. Stable, so the memoized cards skip
  // re-rendering while the cashier types.
  const handleCategoryClick = useCallback(
    (c: CategoryCardData) => setSelectedCategoryId((prev) => (prev === c.id ? null : c.id)),
    [],
  );

  const handleVirtualKeyPress = (key: string) => {
    if (key === "ENTER") return;
    const setter = activeField === "price" ? setPriceQuery : setSearchQuery;
    if (key === "BACKSPACE") {
      setter((prev) => prev.slice(0, -1));
      return;
    }
    // Price field accepts digits only — ignore any non-numeric key.
    if (activeField === "price" && /\D/.test(key)) return;
    setter((prev) => prev + key);
  };

  const displayProducts: Product[] = (
    searchQuery.trim() || selectedCategoryId != null || priceQuery.trim()
      ? (products as unknown as Product[])
      : topSelling
  ).filter((p) => p.isActive && !productRequiresMarking(p));

  useMxikPictureFill(
    displayProducts.map((p) => p.mxik),
    showPictures,
  );
  const pictureOf = (p: Product) =>
    productPictureUrl(p, `${ownVersion}.${(p.mxik && mxikVersions[p.mxik]) || 0}`);

  return (
    <Container>
      <SearchHeader>
        <SearchRow>
          <SearchInputWrapper>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setActiveField("search")}
              placeholder={t("common.search")}
              style={{ padding: "10px 16px", paddingRight: "40px" }}
              autoFocus
            />
            <InputControls>
              {searchQuery.length > 0 && (
                <ClearButton onClick={() => setSearchQuery("")} tabIndex={-1}>
                  <X size={16} />
                </ClearButton>
              )}
            </InputControls>
          </SearchInputWrapper>
          <PriceField
            type="text"
            inputMode="numeric"
            value={priceQuery}
            onChange={(e) => setPriceQuery(e.target.value.replace(/\D/g, ""))}
            onFocus={() => setActiveField("price")}
            placeholder={t("products.exactPrice", "Цена")}
          />
          <KbToggle
            type="button"
            tabIndex={-1}
            $active={keyboardOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setKeyboardOpen((prev) => !prev)}
          >
            <Keyboard size={18} />
            {keyboardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </KbToggle>
        </SearchRow>

        <CategoryBar>
          <CategoryStripScroll>
            {visibleTopCategories.map((c) => (
              <CategoryCard
                key={c.id}
                category={c}
                selected={selectedCategoryId === c.id}
                onClick={handleCategoryClick}
                pictureSrc={showPictures ? categoryPictureUrl(c, ownVersion) : undefined}
              />
            ))}
          </CategoryStripScroll>
          <CategorySelect
            $active={selectedIsOther}
            value={selectedIsOther ? String(selectedCategoryId) : ""}
            onChange={(e) =>
              setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">{t("products.otherCategories", "Другие категории")}</option>
            {otherCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c)}
              </option>
            ))}
          </CategorySelect>
        </CategoryBar>
      </SearchHeader>

      <ProductsScroll>
        {isLoading ? (
          <NoResults>{t("common.loading")}</NoResults>
        ) : displayProducts.length === 0 ? (
          <NoResults>{t("products.noResults")}</NoResults>
        ) : (
          displayProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={onSelect}
              pictureSrc={showPictures ? pictureOf(product) : undefined}
            />
          ))
        )}
      </ProductsScroll>

      {keyboardOpen && (
        <VirtualKeyboard
          fixed
          zIndex={keyboardZIndex}
          onKeyPress={handleVirtualKeyPress}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </Container>
  );
}
