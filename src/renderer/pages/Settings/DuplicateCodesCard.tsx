// Read-only: fiscalised receipts in which two or more packs of one product went to REGOS with the
// same (last scanned) marking code, before codes were sent per line. Lists the codes REGOS never
// received. Free; renders nothing when there are none.
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { FiscalDuplicateCodeReceipt } from "@shared/types";

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.error};
`;

const Muted = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  max-height: 320px;
  overflow-y: auto;
`;

const Receipt = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Code = styled.code`
  font-size: 11px;
  word-break: break-all;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function DuplicateCodesCard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FiscalDuplicateCodeReceipt[]>([]);

  useEffect(() => {
    window.electronAPI.fiscal
      .duplicateCodeReceipts()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <Title>
        <AlertTriangle size={16} />
        {t("fiscalSettings.duplicateCodes.title", { count: rows.length })}
      </Title>
      <Muted>{t("fiscalSettings.duplicateCodes.hint")}</Muted>
      <List>
        {rows.map((r) => (
          <Receipt key={r.saleId}>
            <strong>
              #{r.receiptNumber} · {new Date(r.createdAt).toLocaleString()}
              {r.regosReceiptNo ? ` · REGOS № ${r.regosReceiptNo}` : ""}
            </strong>
            {r.lines.map((l) => (
              <div key={l.barcode}>
                {l.productName} · {l.barcode} —{" "}
                {t("fiscalSettings.duplicateCodes.packs", { packs: l.packs })}
                <div>
                  {t("fiscalSettings.duplicateCodes.sent")}: <Code>{l.sentCode}</Code>
                </div>
                <div>
                  {t("fiscalSettings.duplicateCodes.unsent")}:{" "}
                  {l.unsentCodes.map((c) => (
                    <div key={c}>
                      <Code>{c}</Code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Receipt>
        ))}
      </List>
    </Card>
  );
}
