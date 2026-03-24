import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "../../components/common/Modal";
import type { PriceTagTemplate } from "./PriceTags";
import type { Product } from "@shared/types";

interface PrintTagsModalProps {
  template: PriceTagTemplate;
  onClose: () => void;
}

interface SelectedProduct {
  product: Product;
  quantity: number; // number of label copies to print
  amount: number; // physical quantity on the label (e.g. 1.5 for 1.5 kg)
}

const SearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ProductRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ $selected }) =>
    $selected ? "rgba(59,130,246,0.08)" : "transparent"};
  cursor: pointer;

  &:hover {
    background-color: rgba(59, 130, 246, 0.05);
  }
`;

const ProductInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ProductName = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ProductMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InputsGroup = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const LabeledInput = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const InputLabel = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const QtyInput = styled.input`
  width: 54px;
  padding: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  text-align: center;
`;

const ProductList = styled.div`
  max-height: 350px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SelectedCount = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PrintButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export function PrintTagsModal({ template, onClose }: PrintTagsModalProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Map<number, SelectedProduct>>(
    new Map(),
  );
  const [printing, setPrinting] = useState(false);
  console.log("Selected products:", Array.from(selected.values()));
  
  useEffect(() => {
    (async () => {
      const all = (await window.electronAPI.products.getAll({
        active: true,
      })) as Product[];
      setProducts(all);
    })();
  }, []);

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.nameRu?.toLowerCase().includes(q) ||
      p.nameUz?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );
  });

  const isWeighted = (p: Product) =>
    p.productType === "BULK_WEIGHTED" || p.productType === "PREPACKAGED";

  const toggleProduct = (product: Product) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, { product, quantity: 1, amount: 1 });
      }
      return next;
    });
  };

  const updateQuantity = (id: number, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, quantity: Math.max(1, qty) });
      }
      return next;
    });
  };

  const updateAmount = (id: number, amount: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, amount: Math.max(0.001, amount) });
      }
      return next;
    });
  };

  const getName = (p: Product) =>
    i18n.language === "uz" ? p.nameUz || p.nameRu : p.nameRu || p.nameUz;

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setPrinting(true);

    try {
      await window.electronAPI.printer.printPriceTagsTSPL({
        items: Array.from(selected.values()).map(
          ({ product, quantity, amount }) => ({
            productNameRu: product.nameRu,
            productNameUz: product.nameUz,
            price: product.price,
            barcode: product.barcode,
            unit: product.unit,
            productType: product.productType,
            articleId: product.id,
            amount: isWeighted(product) ? amount : 1,
            copies: quantity,
          }),
        ),
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        lang: i18n.language,
        elements: {
          name: template.elements.name,
          price: template.elements.price,
          unit: template.elements.unit ?? false,
          barcode: template.elements.barcode,
          articleId: template.elements.articleId ?? false,
          customText1: template.elements.customText1,
          customText2: template.elements.customText2,
          customText1Value: template.customText1Value,
          customText2Value: template.customText2Value,
        },
      });
      onClose();
    } catch (err) {
      console.error("Print failed:", err);
    } finally {
      setPrinting(false);
    }
  };

  const totalTags = Array.from(selected.values()).reduce(
    (sum, s) => sum + s.quantity,
    0,
  );

  return (
    <Modal title={t("priceTags.printTags")} onClose={onClose} width="600px">
      <SearchInput
        placeholder={t("common.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      <ProductList>
        {filtered.map((p) => {
          const isSelected = selected.has(p.id);
          const entry = selected.get(p.id);
          return (
            <ProductRow
              key={p.id}
              $selected={isSelected}
              onClick={() => toggleProduct(p)}
            >
              <input type="checkbox" checked={isSelected} readOnly />
              <ProductInfo>
                <ProductName>{getName(p)}</ProductName>
                <ProductMeta>
                  {p.barcode && `${p.barcode} | `}
                  {p.price?.toLocaleString()} {t("common.currency")}
                  {p.unit && ` | ${p.unit}`}
                </ProductMeta>
              </ProductInfo>
              {isSelected && (
                <InputsGroup onClick={(e) => e.stopPropagation()}>
                  {isWeighted(p) && (
                    <LabeledInput>
                      <InputLabel>
                        {i18n.language === "uz" ? "Miqdor" : "Кол-во"}
                      </InputLabel>
                      <QtyInput
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={entry!.amount || ""}
                        onChange={(e) =>
                          updateAmount(p.id, e.target.value === "" ? 0 : parseFloat(e.target.value))
                        }
                      />
                    </LabeledInput>
                  )}
                  <LabeledInput>
                    <InputLabel>
                      {i18n.language === "uz" ? "Nusxa" : "Копий"}
                    </InputLabel>
                    <QtyInput
                      type="number"
                      min={1}
                      value={entry!.quantity || ""}
                      onChange={(e) =>
                        updateQuantity(p.id, e.target.value === "" ? 0 : parseInt(e.target.value))
                      }
                    />
                  </LabeledInput>
                </InputsGroup>
              )}
            </ProductRow>
          );
        })}
      </ProductList>

      <Footer>
        <SelectedCount>
          {t("priceTags.selectedCount", {
            count: selected.size,
            tags: totalTags,
          })}
        </SelectedCount>
        <PrintButton
          onClick={handlePrint}
          disabled={selected.size === 0 || printing}
        >
          {printing ? t("common.processing") : t("priceTags.print")}
        </PrintButton>
      </Footer>
    </Modal>
  );
}
