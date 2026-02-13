import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Modal } from '../../components/common/Modal';
import type { PriceTagTemplate } from './PriceTags';

interface PrintTagsModalProps {
  template: PriceTagTemplate;
  onClose: () => void;
}

interface ProductItem {
  id: string;
  nameRu: string;
  nameUz: string;
  price: number;
  barcode?: string;
  productionDate?: string;
  expiryDate?: string;
}

interface SelectedProduct {
  product: ProductItem;
  quantity: number;
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
    $selected ? 'rgba(59,130,246,0.08)' : 'transparent'};
  cursor: pointer;

  &:hover {
    background-color: rgba(59,130,246,0.05);
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

const QtyInput = styled.input`
  width: 50px;
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
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(new Map());
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    (async () => {
      const all = (await window.electronAPI.products.getAll({ active: true })) as ProductItem[];
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

  const toggleProduct = (product: ProductItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, { product, quantity: 1 });
      }
      return next;
    });
  };

  const updateQuantity = (id: string, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, quantity: Math.max(1, qty) });
      }
      return next;
    });
  };

  const getName = (p: ProductItem) =>
    i18n.language === 'uz' ? p.nameUz || p.nameRu : p.nameRu || p.nameUz;

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setPrinting(true);

    try {
      const html = generatePrintHtml(template, Array.from(selected.values()), i18n.language, t);
      await window.electronAPI.printer.printPriceTags(html, template.widthMm, template.heightMm);
      onClose();
    } catch (err) {
      console.error('Print failed:', err);
    } finally {
      setPrinting(false);
    }
  };

  const totalTags = Array.from(selected.values()).reduce((sum, s) => sum + s.quantity, 0);

  return (
    <Modal title={t('priceTags.printTags')} onClose={onClose} width="600px">
      <SearchInput
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      <ProductList>
        {filtered.map((p) => {
          const isSelected = selected.has(p.id);
          const entry = selected.get(p.id);
          return (
            <ProductRow key={p.id} $selected={isSelected} onClick={() => toggleProduct(p)}>
              <input type="checkbox" checked={isSelected} readOnly />
              <ProductInfo>
                <ProductName>{getName(p)}</ProductName>
                <ProductMeta>
                  {p.barcode && `${p.barcode} | `}
                  {p.price?.toLocaleString()} {t('common.currency')}
                </ProductMeta>
              </ProductInfo>
              {isSelected && (
                <QtyInput
                  type="number"
                  min={1}
                  value={entry!.quantity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateQuantity(p.id, parseInt(e.target.value) || 1)}
                />
              )}
            </ProductRow>
          );
        })}
      </ProductList>

      <Footer>
        <SelectedCount>
          {t('priceTags.selectedCount', { count: selected.size, tags: totalTags })}
        </SelectedCount>
        <PrintButton onClick={handlePrint} disabled={selected.size === 0 || printing}>
          {printing ? t('common.processing') : t('priceTags.print')}
        </PrintButton>
      </Footer>
    </Modal>
  );
}

function generatePrintHtml(
  template: PriceTagTemplate,
  items: SelectedProduct[],
  lang: string,
  t: (key: string) => string
): string {
  const el = template.elements;
  const { widthMm, heightMm, fontSize, fontWeight } = template;

  let tagsHtml = '';
  for (const { product, quantity } of items) {
    const name = lang === 'uz' ? product.nameUz || product.nameRu : product.nameRu || product.nameUz;
    for (let i = 0; i < quantity; i++) {
      tagsHtml += `<div class="tag">`;
      if (el.customText1 && template.customText1Value) {
        tagsHtml += `<div class="line small">${escapeHtml(template.customText1Value)}</div>`;
      }
      if (el.name) {
        tagsHtml += `<div class="line bold">${escapeHtml(name)}</div>`;
      }
      if (el.price) {
        tagsHtml += `<div class="line bold">${Number(product.price).toLocaleString()} ${t('common.currency')}</div>`;
      }
      if (el.barcode && product.barcode) {
        tagsHtml += `<div class="barcode">${escapeHtml(product.barcode)}</div>`;
      }
      if (el.articleId) {
        tagsHtml += `<div class="line small">ID: ${escapeHtml(product.id)}</div>`;
      }
      if (el.productionDate && product.productionDate) {
        tagsHtml += `<div class="line small">${formatDate(product.productionDate)}</div>`;
      }
      if (el.expiryDate && product.expiryDate) {
        tagsHtml += `<div class="line small">${formatDate(product.expiryDate)}</div>`;
      }
      if (el.customText2 && template.customText2Value) {
        tagsHtml += `<div class="line small">${escapeHtml(template.customText2Value)}</div>`;
      }
      tagsHtml += `</div>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: ${widthMm}mm ${heightMm}mm;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: ${fontSize}px;
    font-weight: ${fontWeight};
  }
  .tag {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 2mm;
    page-break-after: always;
    text-align: center;
    overflow: hidden;
  }
  .tag:last-child { page-break-after: auto; }
  .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .bold { font-weight: 700; }
  .small { font-size: 0.75em; }
  .barcode {
    font-family: monospace;
    letter-spacing: 2px;
    font-size: 0.7em;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 1px 4px;
    margin: 1px 0;
  }
</style>
</head>
<body>${tagsHtml}</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return dateStr;
  }
}
