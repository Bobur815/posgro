import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Trash2 } from "lucide-react";
import type { Product } from "@shared/types";
import { formatCurrency } from "@shared/utils";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { products as productsApi } from "../../api/ipc-client";
import { formatQuantity } from "../../utils/formatters";
import { useToast } from "../../context/ToastContext";
import {
  WRITE_OFF_REASONS,
  type WriteOffDetail,
  type WriteOffReason,
  type WriteOffRequest,
} from "../../hooks/useWriteOffs";

interface Line {
  product: Product;
  /** As typed, so "0," or "1." mid-entry is not thrown away. */
  quantity: string;
}

interface Props {
  onClose: () => void;
  onSaved: (doc: WriteOffDetail) => void;
  create: (
    request: WriteOffRequest,
  ) => Promise<{ ok: true; doc: WriteOffDetail } | { ok: false; message: string }>;
}

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Reasons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const ReasonButton = styled.button<{ $active: boolean }>`
  flex: 1;
  min-width: 140px;
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 2px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? "#fff" : theme.colors.text)};
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
`;

const Results = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  max-height: 220px;
  overflow-y: auto;
`;

const Result = styled.button`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  text-align: left;
  font-size: 15px;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  white-space: nowrap;
`;

const LineRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 140px 44px;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const LineName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const Total = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

export function WriteOffFormModal({ onClose, onSaved, create }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const lang = i18n.language as "ru" | "uz";
  // One id per opened form: a double click or a retry after a lost reply posts the same document.
  const requestId = useRef(crypto.randomUUID());

  const [reason, setReason] = useState<WriteOffReason>("EXPIRY");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = (p: Product) => (lang === "uz" ? p.nameUz || p.nameRu : p.nameRu);

  const addProduct = (product: Product) => {
    setQuery("");
    setResults([]);
    if (lines.some((l) => l.product.id === product.id)) {
      toast.error(t("writeOffs.alreadyAdded"));
      return;
    }
    setLines((prev) => [...prev, { product, quantity: "1" }]);
  };

  /** Enter: an exact barcode adds at once (scanner); otherwise list the matches to pick from. */
  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    const exact = (await productsApi.getByBarcode(q)) as Product | null | undefined;
    if (exact) {
      addProduct(exact);
      return;
    }
    const found = ((await productsApi.search(q)) ?? []) as Product[];
    if (found.length === 0) toast.error(t("writeOffs.notFound"));
    setResults(found);
  };

  const parsed = lines.map((l) => ({ ...l, qty: Number(l.quantity.replace(",", ".")) }));
  const totalValue = parsed.reduce(
    (sum, l) => sum + (l.product.cost ?? 0) * (Number.isFinite(l.qty) ? l.qty : 0),
    0,
  );
  const noteMissing = reason === "OTHER" && !note.trim();

  const handleSave = async () => {
    setError(null);
    if (lines.length === 0) return setError(t("writeOffs.noLines"));
    if (noteMissing) return setError(t("writeOffs.errors.NOTE_REQUIRED"));
    if (parsed.some((l) => !Number.isFinite(l.qty) || l.qty <= 0)) {
      return setError(t("writeOffs.errors.NOT_POSITIVE"));
    }
    setSaving(true);
    try {
      const result = await create({
        id: requestId.current,
        reason,
        note: note.trim() || null,
        items: parsed.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(t("writeOffs.saved", { number: result.doc.number }));
      onSaved(result.doc);
    } catch (err) {
      setError(
        t("writeOffs.errors.generic", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t("writeOffs.new")} onClose={onClose} width="760px">
      <Section>
        <Label>{t("writeOffs.reason")}</Label>
        <Reasons>
          {WRITE_OFF_REASONS.map((r) => (
            <ReasonButton key={r} type="button" $active={reason === r} onClick={() => setReason(r)}>
              {t(`writeOffs.reasons.${r}`)}
            </ReasonButton>
          ))}
        </Reasons>
      </Section>

      <Section>
        <Input
          label={t("writeOffs.note")}
          value={note}
          maxLength={500}
          placeholder={
            reason === "OTHER"
              ? t("writeOffs.noteRequiredPlaceholder")
              : t("writeOffs.notePlaceholder")
          }
          onChange={(e) => setNote(e.target.value)}
        />
      </Section>

      <Section>
        <Input
          label={t("writeOffs.addProduct")}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
        />
        {results.length > 0 && (
          <Results>
            {results.map((p) => (
              <Result key={p.id} type="button" onClick={() => addProduct(p)}>
                <span>{name(p)}</span>
                <Muted>
                  {p.barcode} · {formatQuantity(p.stock, p.unit, lang)}
                </Muted>
              </Result>
            ))}
          </Results>
        )}
      </Section>

      {lines.map((l, index) => (
        <LineRow key={l.product.id}>
          <LineName>
            {name(l.product)}
            <Muted>
              {t("writeOffs.inStock", {
                qty: Number(l.product.stock.toFixed(3)),
                unit: l.product.unit,
              })}
            </Muted>
          </LineName>
          <Input
            aria-label={t("writeOffs.quantity")}
            inputMode="decimal"
            value={l.quantity}
            onChange={(e) =>
              setLines((prev) =>
                prev.map((x, i) => (i === index ? { ...x, quantity: e.target.value } : x)),
              )
            }
          />
          <Button
            variant="danger"
            size="small"
            tooltip={t("writeOffs.remove")}
            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
          >
            <Trash2 size={16} />
          </Button>
        </LineRow>
      ))}

      {error && <ErrorText role="alert">{error}</ErrorText>}

      <Footer>
        <Total>
          {t("writeOffs.total")}: {formatCurrency(totalValue, lang)}
        </Total>
        <Button
          variant="danger"
          onClick={handleSave}
          disabled={saving || lines.length === 0 || noteMissing}
        >
          {t("writeOffs.save")}
        </Button>
      </Footer>
    </Modal>
  );
}
