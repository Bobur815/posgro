import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import JsBarcode from 'jsbarcode';
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
  unit?: string;
  productionDate?: string;
  expiryDate?: string;
}

interface SelectedProduct {
  product: ProductItem;
  quantity: number; // number of label copies to print
  amount: number;   // physical quantity on the label (e.g. 1.5 for 1.5 kg)
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
        next.set(product.id, { product, quantity: 1, amount: 1 });
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

  const updateAmount = (id: string, amount: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, amount: Math.max(0.001, amount) });
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
                  {p.unit && ` | ${p.unit}`}
                </ProductMeta>
              </ProductInfo>
              {isSelected && (
                <InputsGroup onClick={(e) => e.stopPropagation()}>
                  <LabeledInput>
                    <InputLabel>{i18n.language === 'uz' ? 'Miqdor' : 'Кол-во'}</InputLabel>
                    <QtyInput
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={entry!.amount}
                      onChange={(e) => updateAmount(p.id, parseFloat(e.target.value) || 1)}
                    />
                  </LabeledInput>
                  <LabeledInput>
                    <InputLabel>{i18n.language === 'uz' ? 'Nusxa' : 'Копий'}</InputLabel>
                    <QtyInput
                      type="number"
                      min={1}
                      value={entry!.quantity}
                      onChange={(e) => updateQuantity(p.id, parseInt(e.target.value) || 1)}
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
          {t('priceTags.selectedCount', { count: selected.size, tags: totalTags })}
        </SelectedCount>
        <PrintButton onClick={handlePrint} disabled={selected.size === 0 || printing}>
          {printing ? t('common.processing') : t('priceTags.print')}
        </PrintButton>
      </Footer>
    </Modal>
  );
}

function generateBarcodeSvg(barcode: string): string {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const format = /^\d{13}$/.test(barcode) ? 'EAN13' : 'CODE128';
    JsBarcode(svg as unknown as HTMLElement, barcode, {
      format,
      width: 2,
      height: 50,
      fontSize: 11,
      margin: 2,
      displayValue: true,
    });
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svg);
  } catch {
    return '';
  }
}

function formatAmount(amount: number, unit: string): string {
  const formatted =
    amount % 1 === 0
      ? String(Math.round(amount))
      : amount.toFixed(3).replace(/\.?0+$/, '');
  return `${formatted} ${unit}`;
}

function generatePrintHtml(
  template: PriceTagTemplate,
  items: SelectedProduct[],
  lang: string,
  t: (key: string) => string
): string {
  const el = template.elements;
  const { widthMm, heightMm, fontSize, fontWeight } = template;
  const currency = t('common.currency');
  const totalLabel = lang === 'uz' ? 'Jami' : 'Итого';

  // Always print in portrait: rotate content when template is landscape
  const needsRotation = widthMm > heightMm;
  const pageW = needsRotation ? heightMm : widthMm;
  const pageH = needsRotation ? widthMm : heightMm;

  let tagsHtml = '';
  for (const { product, quantity, amount } of items) {
    const name = lang === 'uz' ? product.nameUz || product.nameRu : product.nameRu || product.nameUz;
    const rawUnit = product.unit || 'шт';
    const unitDisplay = lang === 'uz' && rawUnit === 'шт' ? 'dona' : rawUnit;
    const formattedAmount = formatAmount(amount, unitDisplay);
    const pricePerUnit = `${Number(product.price).toLocaleString('ru-RU')} ${currency}/${unitDisplay}`;
    const total = amount * Number(product.price);
    const totalStr = `${totalLabel}: ${Math.round(total).toLocaleString('ru-RU')} ${currency}`;
    const barcodeSvg = el.barcode && product.barcode ? generateBarcodeSvg(product.barcode) : '';

    for (let i = 0; i < quantity; i++) {
      let tagHtml = `<div class="tag">`;

      if (el.customText1 && template.customText1Value) {
        tagHtml += `<div class="line small">${escapeHtml(template.customText1Value)}</div>`;
      }

      // Article ID before name
      if (el.articleId) {
        tagHtml += `<div class="line small">ID: ${escapeHtml(product.id)}</div>`;
      }

      // Row 1: Product name
      if (el.name) {
        tagHtml += `<div class="name">${escapeHtml(name)}</div>`;
      }

      // Row 2: quantity | price per unit
      if (el.price) {
        tagHtml += `<div class="info-row">`;
        tagHtml += `<div class="qty-cell">${escapeHtml(formattedAmount)}</div>`;
        tagHtml += `<div class="price-cell">${escapeHtml(pricePerUnit)}</div>`;
        tagHtml += `</div>`;
      }

      // Row 3: barcode | total
      tagHtml += `<div class="bottom-row">`;
      if (barcodeSvg) {
        tagHtml += `<div class="barcode-cell">${barcodeSvg}</div>`;
      } else if (el.barcode && product.barcode) {
        tagHtml += `<div class="barcode-cell"><span class="barcode-text">${escapeHtml(product.barcode)}</span></div>`;
      } else {
        tagHtml += `<div class="barcode-cell"></div>`;
      }
      if (el.price) {
        tagHtml += `<div class="total-cell">${escapeHtml(totalStr)}</div>`;
      }
      tagHtml += `</div>`;

      // Production/expiry dates side by side
      if ((el.productionDate && product.productionDate) || (el.expiryDate && product.expiryDate)) {
        tagHtml += `<div class="dates-row">`;
        if (el.productionDate && product.productionDate) {
          tagHtml += `<div class="line small">${formatDate(product.productionDate)}</div>`;
        }
        if (el.expiryDate && product.expiryDate) {
          tagHtml += `<div class="line small">${formatDate(product.expiryDate)}</div>`;
        }
        tagHtml += `</div>`;
      }

      if (el.customText2 && template.customText2Value) {
        tagHtml += `<div class="line small">${escapeHtml(template.customText2Value)}</div>`;
      }

      tagHtml += `</div>`;

      tagsHtml += needsRotation
        ? `<div class="page-wrapper">${tagHtml}</div>`
        : tagHtml;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: ${pageW}mm ${pageH}mm;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: ${fontSize}px;
    font-weight: ${fontWeight};
  }
  ${needsRotation ? `
  .page-wrapper {
    width: ${pageW}mm;
    height: ${pageH}mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
  }
  .page-wrapper:last-child { page-break-after: auto; }
  .tag {
    position: absolute;
    top: ${widthMm}mm;
    left: 0;
    transform: rotate(-90deg);
    transform-origin: top left;
  }
  ` : `
  .tag { page-break-after: always; }
  .tag:last-child { page-break-after: auto; }
  `}
  .tag {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 2mm;
    overflow: hidden;
  }
  .name {
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85em;
  }
  .price-cell { text-align: right; }
  .bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 2mm;
  }
  .barcode-cell {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  .barcode-cell svg {
    max-height: ${Math.max(12, Math.round(heightMm * 0.45))}mm;
    width: 100%;
    display: block;
  }
  .barcode-text {
    font-family: monospace;
    font-size: 0.7em;
    letter-spacing: 1px;
  }
  .total-cell {
    font-weight: 700;
    font-size: 0.85em;
    text-align: right;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dates-row {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
  }
  .line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }
  .bold { font-weight: 700; }
  .small { font-size: 0.75em; }
</style>
</head>
<body>${tagsHtml}</body>
</html>`;
}

function escapeHtml(str: unknown): string {
  return String(str)
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
