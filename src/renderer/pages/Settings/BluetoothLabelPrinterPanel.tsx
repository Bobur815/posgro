import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RefreshCw } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { useVirtualKeyboard } from "../../hooks/useVirtualKeyboard";
import { KeyboardToggle, KeyboardPanel } from "../../components/common/VirtualKeyboardControls";
import { labelPrinterErrorKey, useLabelPrinter } from "../../hooks/useLabelPrinter";
import type {
  LabelPrinterConfig,
  LabelPrintMode,
  SerialPortInfo,
} from "@shared/types/label-printer.types";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const Panel = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-end;
  flex-wrap: wrap;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  font-size: 14px;
  width: 80px;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Select = styled.select`
  font-size: 14px;
  min-width: 120px;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Radio = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" }>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background-color: ${({ theme, $variant }) =>
    $variant === "secondary" ? theme.colors.border : theme.colors.primary};
  color: ${({ $variant, theme }) => ($variant === "secondary" ? theme.colors.text : "#fff")};
  &:hover {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

type NumField = "widthMm" | "heightMm" | "gapMm";

/**
 * Settings for the XP-365B on a Bluetooth COM port, and the switch that sends price tags there
 * instead of the Windows printer. Lives on the Price tags page next to the Windows printer picker.
 */
export function BluetoothLabelPrinterPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, ports, portsLoading, refreshPorts, save, testPrint } = useLabelPrinter();
  const [draft, setDraft] = useState<LabelPrinterConfig | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const keyboard = useVirtualKeyboard<NumField>((field, edit) => {
    setDraft((d) => {
      if (!d) return d;
      const next = edit(String(d[field] || ""));
      return { ...d, [field]: next === "" ? 0 : Number(next) };
    });
  });

  if (!draft) return null;

  const update = <K extends keyof LabelPrinterConfig>(key: K, value: LabelPrinterConfig[K]) =>
    setDraft({ ...draft, [key]: value });

  // The saved port may be missing from the list (printer unpaired); keep it selectable.
  const portOptions: SerialPortInfo[] = ports.some((p) => p.path === draft.port)
    ? ports
    : [{ path: draft.port }, ...ports];

  const handleSave = async (): Promise<boolean> => {
    setBusy("save");
    try {
      await save(draft);
      toast.success(t("common.saved"));
      return true;
    } catch {
      toast.error(t("labelPrinter.invalidConfig"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Test with what is on screen: save first, so the test and the next print agree.
  const handleTest = async () => {
    if (!(await handleSave())) return;
    setBusy("test");
    try {
      const result = await testPrint();
      if (result.ok) toast.success(t("labelPrinter.testOk"));
      else toast.error(t(labelPrinterErrorKey(result.code), { port: draft.port }));
    } finally {
      setBusy(null);
    }
  };

  const numInput = (field: NumField) => (
    <Field>
      {t(`labelPrinter.${field === "widthMm" ? "width" : field === "heightMm" ? "height" : "gap"}`)}
      <Input
        type="number"
        value={draft[field] || ""}
        onChange={(e) => update(field, e.target.value === "" ? 0 : Number(e.target.value))}
        {...keyboard.fieldProps(field, { numeric: true, clearOnFirstKey: true })}
      />
    </Field>
  );

  return (
    <Panel>
      <PanelTitle>{t("labelPrinter.title")}</PanelTitle>

      <Row>
        <span style={{ fontSize: 14 }}>{t("labelPrinter.mode")}:</span>
        {(["spooler", "bluetooth"] as LabelPrintMode[]).map((m) => (
          <Radio key={m}>
            <input
              type="radio"
              name="label-print-mode"
              checked={draft.mode === m}
              onChange={() => update("mode", m)}
            />
            {t(m === "spooler" ? "labelPrinter.modeSpooler" : "labelPrinter.modeBluetooth")}
          </Radio>
        ))}
      </Row>

      <Row>
        <Field>
          {t("labelPrinter.port")}
          <div style={{ display: "flex", gap: 8 }}>
            <Select value={draft.port} onChange={(e) => update("port", e.target.value)}>
              {portOptions.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.friendlyName ?? p.path}
                </option>
              ))}
            </Select>
            <IconButton
              type="button"
              onClick={refreshPorts}
              disabled={portsLoading}
              title={t("labelPrinter.refreshPorts")}
            >
              <RefreshCw size={16} />
            </IconButton>
          </div>
        </Field>
        <Field>
          {t("labelPrinter.baud")}
          <Select
            value={draft.baudRate}
            onChange={(e) => update("baudRate", Number(e.target.value))}
          >
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        {numInput("widthMm")}
        {numInput("heightMm")}
        {numInput("gapMm")}
        <KeyboardToggle kb={keyboard} />
      </Row>

      {ports.length === 0 && !portsLoading && <Hint>{t("labelPrinter.noPorts")}</Hint>}
      <Hint>{t("labelPrinter.hint")}</Hint>

      <Row>
        <Button onClick={handleSave} disabled={busy !== null}>
          {busy === "save" ? t("common.saving") : t("common.save")}
        </Button>
        <Button $variant="secondary" onClick={handleTest} disabled={busy !== null}>
          {busy === "test" ? t("common.processing") : t("labelPrinter.testPrint")}
        </Button>
      </Row>

      <KeyboardPanel kb={keyboard} />
    </Panel>
  );
}
