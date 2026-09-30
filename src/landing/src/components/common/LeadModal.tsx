import { useEffect, useRef, useState, type FormEvent } from "react";
import styled from "styled-components";
import { CheckCircle2, ChevronDown, X } from "lucide-react";
import { useLanding } from "../../context/LandingContext";
import type { StringKey } from "../../i18n";
import { gradient, INFO } from "../../styles/brand";
import { sendLead, type LeadResult, type LeadStoreType } from "../../api/leads";
import { IconBtn } from "./Buttons";

const STORE_TYPES: LeadStoreType[] = [
  "GROCERY",
  "SUPERMARKET",
  "MINIMARKET",
  "PHARMACY",
  "HOUSEHOLD",
  "CLOTHING",
  "ELECTRONICS",
  "SPORTS",
  "TOYS",
  "FURNITURE",
  "COSMETICS",
  "JEWELRY",
  "BOOKS",
  "PET",
  "OTHER",
];

const ERROR_COLOR = "#e53935";
const ERROR_RING = "rgba(229, 57, 53, 0.2)";

/** Border plus a soft halo — far easier to spot than a border colour change alone. */
const focusRing = `border-color: ${INFO.main}; box-shadow: 0 0 0 3px ${INFO.ring};`;

/** Nine national digits → `(90) 123 45 67`, built up as they are typed. */
function formatPhone(digits: string): string {
  const d = digits.slice(0, 9);
  if (!d) return "";
  let out = `(${d.slice(0, 2)}`;
  if (d.length >= 2) out += ")";
  if (d.length > 2) out += ` ${d.slice(2, 5)}`;
  if (d.length > 5) out += ` ${d.slice(5, 7)}`;
  if (d.length > 7) out += ` ${d.slice(7, 9)}`;
  return out;
}

/** Keeps the nine national digits, even when a full `+998 …` number is pasted in. */
function phoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return (d.length > 9 && d.startsWith("998") ? d.slice(3) : d).slice(0, 9);
}

/**
 * Native <dialog>: showModal() gives the focus trap, Esc and the inert page for free, which a
 * hand-rolled overlay would have to reimplement.
 */
const Dialog = styled.dialog`
  width: min(520px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);

  &::backdrop {
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }
`;

const Body = styled.div`
  position: relative;
  padding: 44px 40px 36px;

  @media (max-width: 480px) {
    padding: 40px 20px 24px;
  }
`;

const Close = styled(IconBtn)`
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
`;

const Title = styled.h2`
  margin: 0 0 28px;
  text-align: center;
  font-size: clamp(21px, 4vw, 26px);
  line-height: 1.25;
  letter-spacing: -0.02em;
`;

const Accent = styled.span`
  ${gradient}
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/** The filled look from the reference: no border until focus, the page background as fill. */
const field = `
  width: 100%;
  height: 52px;
  padding: 0 18px;
  border-radius: 14px;
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
`;

const Input = styled.input`
  ${field}
  border: 1.5px solid transparent;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
    opacity: 0.7;
  }
  &:focus {
    ${focusRing}
  }
`;

const PhoneWrap = styled.div<{ $invalid: boolean }>`
  display: flex;
  align-items: stretch;
  height: 52px;
  border-radius: 14px;
  border: 1.5px solid
    ${({ $invalid }) => ($invalid ? ERROR_COLOR : "transparent")};
  background: ${({ theme }) => theme.colors.background};
  overflow: hidden;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;

  &:focus-within {
    ${({ $invalid }) =>
      $invalid
        ? `border-color: ${ERROR_COLOR}; box-shadow: 0 0 0 3px ${ERROR_RING};`
        : focusRing}
  }

  /* The wrapper draws the ring; the input inside stays flat. */
  ${Input} {
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
`;

const Prefix = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 0 18px;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
`;

const SelectWrap = styled.div`
  position: relative;

  svg {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Select = styled.select<{ $empty: boolean }>`
  ${field}
  padding-right: 44px;
  appearance: none;
  border: 1.5px solid transparent;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ $empty, theme }) =>
    $empty ? theme.colors.textSecondary : theme.colors.text};
  cursor: pointer;

  &:focus {
    ${focusRing}
  }
  option {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.surface};
  }
`;

/** Off-screen rather than display:none — some bots skip fields they can tell are hidden. */
const Honeypot = styled.input`
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  opacity: 0;
`;

const Hint = styled.p`
  margin: -8px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: ${ERROR_COLOR};
`;

const Submit = styled.button`
  ${gradient}
  height: 56px;
  margin-top: 10px;
  border: none;
  border-radius: 14px;
  color: #fff;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  /* Keyboard only: a mouse click should not leave a halo behind. */
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${INFO.ring};
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const Done = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 12px 0 4px;
  text-align: center;

  svg {
    color: ${({ theme }) => theme.colors.primary};
  }
  h2 {
    margin: 4px 0 0;
    font-size: 24px;
  }
  p {
    margin: 0 0 12px;
    max-width: 340px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  ${Submit} {
    align-self: stretch;
  }
`;

type Status = "idle" | "sending" | "done" | Exclude<LeadResult, "ok">;

const EMPTY = {
  fullName: "",
  phone: "",
  storeName: "",
  storeType: "",
  website: "",
};

export function LeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useLanding();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fires for Esc, the X button and a backdrop click alike.
  const handleClose = () => {
    document.body.style.overflow = "";
    if (status === "done") {
      setForm(EMPTY);
      setPhoneTouched(false);
    }
    setStatus("idle");
    onClose();
  };

  const phoneOk = form.phone.length === 9;
  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (!phoneOk || !form.storeType) return;
    setStatus("sending");
    const result = await sendLead({
      fullName: form.fullName.trim(),
      phone: `+998${form.phone}`,
      storeName: form.storeName.trim(),
      storeType: form.storeType as LeadStoreType,
      lang,
      website: form.website,
    });
    setStatus(result === "ok" ? "done" : result);
  };

  return (
    <Dialog
      ref={ref}
      onClose={handleClose}
      aria-labelledby="lead-title"
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <Body>
        <Close
          type="button"
          onClick={() => ref.current?.close()}
          aria-label={t("lead.close")}
        >
          <X size={20} />
        </Close>

        {status === "done" ? (
          <Done role="status">
            <CheckCircle2 size={56} />
            <h2 id="lead-title">{t("lead.doneTitle")}</h2>
            <p>{t("lead.doneText")}</p>
            <Submit type="button" onClick={() => ref.current?.close()}>
              {t("lead.close")}
            </Submit>
          </Done>
        ) : (
          <>
            <Title id="lead-title">
              <Accent>{t("lead.titleAccent")}</Accent> {t("lead.titleRest")}
            </Title>
            <Form onSubmit={submit}>
              <Label>
                {t("lead.name")}
                <Input
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder={t("lead.namePh")}
                  value={form.fullName}
                  onChange={(e) => set("fullName")(e.target.value)}
                />
              </Label>

              <Label>
                {t("lead.phone")}
                <PhoneWrap $invalid={phoneTouched && !phoneOk}>
                  <Prefix>🇺🇿 +998</Prefix>
                  <Input
                    required
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="(XX) XXX XX XX"
                    value={formatPhone(form.phone)}
                    onChange={(e) => set("phone")(phoneDigits(e.target.value))}
                    onBlur={() => form.phone && setPhoneTouched(true)}
                    aria-invalid={phoneTouched && !phoneOk}
                  />
                </PhoneWrap>
              </Label>
              {phoneTouched && !phoneOk && (
                <Hint>{t("lead.invalidPhone")}</Hint>
              )}

              <Label>
                {t("lead.store")}
                <Input
                  required
                  maxLength={120}
                  autoComplete="organization"
                  placeholder={t("lead.storePh")}
                  value={form.storeName}
                  onChange={(e) => set("storeName")(e.target.value)}
                />
              </Label>

              <Label>
                {t("lead.type")}
                <SelectWrap>
                  <Select
                    required
                    $empty={!form.storeType}
                    value={form.storeType}
                    onChange={(e) => set("storeType")(e.target.value)}
                  >
                    <option value="" disabled>
                      {t("lead.typePh")}
                    </option>
                    {STORE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`lead.type.${type}` as StringKey)}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown size={18} />
                </SelectWrap>
              </Label>

              <Honeypot
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                name="website"
                value={form.website}
                onChange={(e) => set("website")(e.target.value)}
              />

              {status === "failed" && (
                <Hint role="alert">{t("lead.failed")}</Hint>
              )}
              {status === "rate-limited" && (
                <Hint role="alert">{t("lead.rateLimited")}</Hint>
              )}

              <Submit type="submit" disabled={status === "sending"}>
                {status === "sending" ? t("lead.sending") : t("lead.submit")}
              </Submit>
            </Form>
          </>
        )}
      </Body>
    </Dialog>
  );
}
