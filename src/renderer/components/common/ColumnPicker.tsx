import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";

/**
 * A small button for a table's first header cell that opens a checklist of the table's columns
 * (checked = shown). The list is portalled to <body> with position: fixed, so the table's
 * overflow-x: auto container cannot clip it. Shared by the POS and the web dashboard.
 */

const POPOVER_WIDTH = 260;
const GAP = 4;

const Trigger = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin-right: ${({ theme }) => theme.spacing.xs};
  vertical-align: middle;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme, $open }) => ($open ? theme.colors.primary : theme.colors.border)};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme, $open }) => ($open ? theme.colors.primary : theme.colors.textSecondary)};
  cursor: pointer;

  /* A 32px icon, but a 44px touch target. */
  position: relative;
  &::after {
    content: "";
    position: absolute;
    inset: -6px;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`;

const Popover = styled.div`
  position: fixed;
  z-index: 1200;
  width: ${POPOVER_WIDTH}px;
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  font-weight: 400;
  text-align: left;
`;

const Title = styled.div`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const List = styled.div`
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: ${({ theme }) => theme.spacing.xs} 0;
`;

const Row = styled.label<{ $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  color: ${({ theme, $disabled }) => ($disabled ? theme.colors.textSecondary : theme.colors.text)};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  input {
    width: 18px;
    height: 18px;
    margin: 0;
    flex-shrink: 0;
    accent-color: ${({ theme }) => theme.colors.primary};
    cursor: inherit;
  }
`;

const ResetButton = styled.button`
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 0 0 ${({ theme }) => theme.borderRadius} ${({ theme }) => theme.borderRadius};
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
`;

export interface ColumnPickerItem<K extends string> {
  key: K;
  label: string;
  /** Shown checked and disabled. */
  alwaysVisible?: boolean;
}

interface ColumnPickerProps<K extends string> {
  columns: ReadonlyArray<ColumnPickerItem<K>>;
  visible: ReadonlySet<K>;
  onToggle: (key: K) => void;
  onReset: () => void;
}

export function ColumnPicker<K extends string>({
  columns,
  visible,
  onToggle,
  onReset,
}: ColumnPickerProps<K>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = window.innerWidth - POPOVER_WIDTH - GAP;
    setPosition({ top: rect.bottom + GAP, left: Math.max(GAP, Math.min(rect.left, maxLeft)) });
  }, []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Placed in the same update that opens it, so the list is in the DOM — at the right spot — by
  // the time the effect below moves focus into it.
  const openPicker = () => {
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    // Keyboard users land on the first checkbox.
    popoverRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // Focus stays wherever the user clicked.
      close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    // Follow the trigger when the page or the table scrolls under it.
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  const title = t("products.columns");

  return (
    <>
      <Trigger
        ref={triggerRef}
        type="button"
        $open={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={title}
        title={title}
        onClick={() => (open ? close(true) : openPicker())}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
      </Trigger>
      {open &&
        position &&
        createPortal(
          <Popover
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={title}
            style={{ top: position.top, left: position.left }}
          >
            <Title>{title}</Title>
            <List>
              {columns.map((c) => (
                <Row key={c.key} $disabled={!!c.alwaysVisible}>
                  <input
                    type="checkbox"
                    checked={c.alwaysVisible || visible.has(c.key)}
                    disabled={c.alwaysVisible}
                    onChange={() => onToggle(c.key)}
                  />
                  {c.label}
                </Row>
              ))}
            </List>
            <ResetButton type="button" onClick={onReset}>
              {t("products.columnsReset")}
            </ResetButton>
          </Popover>,
          document.body,
        )}
    </>
  );
}
