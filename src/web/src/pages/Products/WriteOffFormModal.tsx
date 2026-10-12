import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Trash2 } from "lucide-react";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { useToast } from "@context/ToastContext";
import { formatCurrency } from "@shared/utils";
import {
  products as productsApi,
  writeOffs as writeOffsApi,
  type WriteOffDetail,
  type WriteOffReason,
} from "../../api/client";

/** The fields this form reads. Both backends send Decimal stock and cost as strings. */
interface PickProduct {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  unit: string;
  stock: number;
  cost: number | null;
}

interface Line {
  product: PickProduct;
  /** As typed, so "0," or "1." mid-entry is kept. */
  quantity: string;
}

const REASONS: WriteOffReason[] = ["EXPIRY", "DAMAGE", "OTHER"];
const MAX_RESULTS = 20;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.div`
  font-size: 13px;
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
  min-width: 120px;
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 2px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? "#fff" : theme.colors.text)};
  font-weight: 600;
  cursor: pointer;
`;

const Results = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  max-height: 240px;
  overflow-y: auto;
`;

const Result = styled.button`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  text-align: left;
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
  font-size: 12px;
`;

const LineRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 110px 44px;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const LineName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const Total = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

const toNumber = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

interface Props {
  onClose: () => void;
  onSaved: (doc: WriteOffDetail) => void;
}

export function WriteOffFormModal({ onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const lang = i18n.language as "ru" | "uz";
  // One id per opened form: a double click or a retry after a lost reply posts the same document.
  const requestId = useRef(crypto.randomUUID());

  const [catalog, setCatalog] = useState<PickProduct[] | null>(null);
  const [reason, setReason] = useState<WriteOffReason>("EXPIRY");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The VPS does not filter /products by `query` (the dashboard searches in the browser), so the
  // active catalog is loaded once and matched here — the same on both backends.
  useEffect(() => {
    let cancelled = false;
    productsApi
      .getAll({ active: true })
      .then((rows: unknown) => {
        if (cancelled) return;
        const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
        setCatalog(
          list.map((p) => ({
            id: Number(p.id),
            nameRu: String(p.nameRu ?? ""),
            nameUz: String(p.nameUz ?? ""),
            barcode: String(p.barcode ?? ""),
            unit: String(p.unit ?? ""),
            stock: toNumber(p.stock) ?? 0,
            cost: toNumber(p.cost),
          })),
        );
      })
      .catch(
        (e: Error) => !cancelled && setError(t("writeOffs.errors.generic", { message: e.message })),
      );
    return () => {
      cancelled = true;
    };
  }, [t]);

  const name = (p: PickProduct) => (lang === "uz" ? p.nameUz || p.nameRu : p.nameRu);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !catalog) return [];
    return catalog
      .filter(
        (p) =>
          p.barcode.includes(q) ||
          p.nameRu.toLowerCase().includes(q) ||
          p.nameUz.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [catalog, query]);

  const addProduct = (product: PickProduct) => {
    setQuery("");
    if (lines.some((l) => l.product.id === product.id)) {
      toast.error(t("writeOffs.alreadyAdded"));
      return;
    }
    setLines((prev) => [...prev, { product, quantity: "1" }]);
  };

  /** Enter: an exact barcode (scanner) adds at once; otherwise the single match, if only one. */
  const handleEnter = () => {
    const q = query.trim();
    if (!q || !catalog) return;
    const exact = catalog.find((p) => p.barcode === q);
    if (exact) return addProduct(exact);
    if (matches.length === 1) return addProduct(matches[0]);
    if (matches.length === 0) toast.error(t("writeOffs.notFound"));
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
    for (const l of parsed) {
      if (!Number.isFinite(l.qty) || l.qty <= 0)
        return setError(t("writeOffs.errors.NOT_POSITIVE"));
      // The server refuses this too; checked here so the message is in the user's language.
      if (l.qty > l.product.stock) {
        return setError(
          t("writeOffs.errors.EXCEEDS_STOCK", {
            product: name(l.product),
            stock: l.product.stock,
            quantity: l.qty,
          }),
        );
      }
    }
    setSaving(true);
    try {
      const doc = await writeOffsApi.create({
        id: requestId.current,
        reason,
        note: note.trim() || null,
        items: parsed.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      });
      toast.success(t("writeOffs.saved", { number: doc.number }));
      onSaved(doc);
    } catch (e) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as Error).message;
      setError(t("writeOffs.errors.generic", { message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t("writeOffs.new")} onClose={onClose}>
      <Section>
        <Label>{t("writeOffs.reason")}</Label>
        <Reasons>
          {REASONS.map((r) => (
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
          disabled={!catalog}
          placeholder={catalog ? undefined : t("writeOffs.loadingProducts")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleEnter();
            }
          }}
        />
        {matches.length > 0 && (
          <Results>
            {matches.map((p) => (
              <Result key={p.id} type="button" onClick={() => addProduct(p)}>
                <span>{name(p)}</span>
                <Muted>
                  {p.barcode} · {p.stock} {p.unit}
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
            <Muted>{t("writeOffs.inStock", { qty: l.product.stock, unit: l.product.unit })}</Muted>
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
            aria-label={t("writeOffs.remove")}
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
