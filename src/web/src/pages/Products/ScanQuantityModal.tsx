import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Minus, Plus } from "lucide-react";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";
import type { InventoryCountItem } from "../../api/client";

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

/* Same visual language as the item cards on the counting screen. */
const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
`;

const ProductName = styled.div`
  font-weight: 600;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text};
`;

const Barcode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CardRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};

  strong {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Stepper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const StepButton = styled.button`
  min-width: 52px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const QtyInput = styled.input`
  width: 120px;
  min-height: 52px;
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  padding: ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};

  /* The steppers are the control — the native arrows are redundant and hard to hit. */
  appearance: textfield;
  -moz-appearance: textfield;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

const Unit = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* Add vs. set total. Two plain buttons rather than a tab strip: there are only ever two. */
const ModeSwitch = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const ModeButton = styled.button<{ $active: boolean }>`
  flex: 1;
  min-height: 44px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background-color: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? "#fff" : theme.colors.textSecondary)};

  &:disabled {
    cursor: not-allowed;
  }
`;

/* The sum the counter would otherwise do on a calculator, or what a total will replace. */
const Result = styled.div<{ $warn?: boolean }>`
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  min-height: 22px;
  color: ${({ theme, $warn }) => ($warn ? theme.colors.warning : theme.colors.text)};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;

  @media (max-width: 640px) {
    flex-direction: column-reverse;
  }
`;

/** "add": the typed quantity goes on top of the line. "total": it replaces the line. */
export type ScanQtyMode = "add" | "total";

interface ScanQuantityModalProps {
  item: InventoryCountItem;
  /** Hide the expected quantity so the counter isn't anchored to the system number. */
  blindCount: boolean;
  isSaving: boolean;
  onSave: (qty: number, mode: ScanQtyMode) => void;
  onClose: () => void;
}

/** Three decimals is the finest quantity a line holds (kg); hides float noise like 0.30000000000000004. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Opened after a CAMERA scan so the counter can type how many they actually see, rather than the
 * +1 the handheld-scanner flow applies.
 *
 * ADDS by default: the same product often sits in two places, and whoever counts the second
 * shelf types what is on THAT shelf (117), not the store's total — the line becomes 68 + 117 =
 * 185 without a calculator. "Set total" is the correction path (two people counted the same
 * shelf): pre-filled with the current figure, and it replaces it.
 */
export function ScanQuantityModal({
  item,
  blindCount,
  isSaving,
  onSave,
  onClose,
}: ScanQuantityModalProps) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const current = item.countedQty === null ? 0 : Number(item.countedQty);
  const [mode, setMode] = useState<ScanQtyMode>("add");
  const [value, setValue] = useState("");

  const productName =
    i18n.language === "uz" ? item.productNameUz : item.productName;

  useEffect(() => {
    // Select rather than just focus, so typing replaces a pre-filled total.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [mode]);

  const switchMode = (next: ScanQtyMode) => {
    if (next === mode) return;
    setMode(next);
    // Each mode starts from what it means: nothing added yet, or the total as it stands.
    setValue(next === "total" && item.countedQty !== null ? String(current) : "");
  };

  const parsed = Number(value);
  const isNumber = value.trim() !== "" && Number.isFinite(parsed);
  // Adding 0 changes nothing; a total of 0 is a real count ("none on the shelf").
  const isValid = isNumber && (mode === "add" ? parsed > 0 : parsed >= 0);
  const newTotal = mode === "add" ? round3(current + (isNumber ? parsed : 0)) : parsed;

  const step = (delta: number) => {
    const base = value.trim() === "" ? 0 : Number(value);
    const next = Math.max(0, (Number.isFinite(base) ? base : 0) + delta);
    setValue(String(next));
  };

  const submit = () => {
    if (!isValid || isSaving) return;
    onSave(parsed, mode);
  };

  return (
    <Modal title={t("inventoryCount.detail.scanQty.title")} onClose={onClose}>
      <Body>
        <Card>
          <ProductName>{productName}</ProductName>
          <Barcode>{item.barcode}</Barcode>
          {!blindCount && (
            <CardRow>
              <span>{t("inventoryCount.detail.expected")}</span>
              <strong>
                {Number(item.expectedQty)} {item.unit}
              </strong>
            </CardRow>
          )}
          <CardRow>
            <span>{t("inventoryCount.detail.scanQty.currentlyCounted")}</span>
            <strong>
              {item.countedQty === null
                ? t("inventoryCount.detail.scanQty.notCountedYet")
                : `${Number(item.countedQty)} ${item.unit}`}
            </strong>
          </CardRow>
        </Card>

        <ModeSwitch role="tablist">
          <ModeButton
            type="button"
            role="tab"
            aria-selected={mode === "add"}
            $active={mode === "add"}
            disabled={isSaving}
            onClick={() => switchMode("add")}
          >
            {t("inventoryCount.detail.scanQty.modeAdd")}
          </ModeButton>
          <ModeButton
            type="button"
            role="tab"
            aria-selected={mode === "total"}
            $active={mode === "total"}
            disabled={isSaving}
            onClick={() => switchMode("total")}
          >
            {t("inventoryCount.detail.scanQty.modeTotal")}
          </ModeButton>
        </ModeSwitch>

        <Stepper>
          <StepButton
            type="button"
            aria-label="-1"
            disabled={isSaving}
            onClick={() => step(-1)}
          >
            <Minus size={20} />
          </StepButton>
          <QtyInput
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={isSaving}
            value={value}
            placeholder={t("inventoryCount.detail.scanQty.enterQty")}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <StepButton
            type="button"
            aria-label="+1"
            disabled={isSaving}
            onClick={() => step(1)}
          >
            <Plus size={20} />
          </StepButton>
        </Stepper>
        <Unit style={{ textAlign: "center" }}>{item.unit}</Unit>

        {mode === "add" ? (
          <Result>
            {isValid
              ? item.countedQty === null
                ? `= ${newTotal} ${item.unit}`
                : `${current} + ${round3(parsed)} = ${newTotal} ${item.unit}`
              : t("inventoryCount.detail.scanQty.addHint")}
          </Result>
        ) : (
          <Result $warn>
            {t("inventoryCount.detail.scanQty.totalHint", {
              from: item.countedQty === null ? "—" : `${current} ${item.unit}`,
              to: isValid ? `${newTotal} ${item.unit}` : "…",
            })}
          </Result>
        )}

        <Actions>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!isValid || isSaving}
            onClick={submit}
          >
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </Actions>
      </Body>
    </Modal>
  );
}
