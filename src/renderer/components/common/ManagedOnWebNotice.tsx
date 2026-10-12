import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Info } from "lucide-react";

const Notice = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.info};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.info};
  }
`;

/**
 * Shown on a cashier-only store's read-only lists (users, suppliers): why there is nothing to edit
 * here, and where it is edited instead.
 */
export function ManagedOnWebNotice() {
  const { t } = useTranslation();
  return (
    <Notice role="note">
      <Info size={18} />
      {t("common.managedOnWeb")}
    </Notice>
  );
}
