import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Select } from "../common/Select";
import { Button } from "../common/Button";
import { Category } from "@shared/types";
import { Eraser } from "lucide-react";

export interface SupplierFilterParams {
  status?: "all" | "active" | "inactive";
  balance?: "all" | "we_owe" | "they_owe";
  categoryId?: number;
}

interface SupplierFiltersProps {
  filters: SupplierFilterParams;
  onChange: (filters: SupplierFilterParams) => void;
  categories: Category[];
  isOpen?: boolean;
}

const FiltersBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-end;
`;

const FilterItem = styled.div`
  min-width: 140px;
`;

export function SupplierFilters({
  filters,
  onChange,
  categories,
  isOpen = false,
}: SupplierFiltersProps) {
  const { t, i18n } = useTranslation();

  const update = (patch: Partial<SupplierFilterParams>) => {
    onChange({ ...filters, ...patch });
  };

  const clearFilters = () => {
    onChange({});
  };

  const hasActiveFilters =
    (filters.status && filters.status !== "all") ||
    (filters.balance && filters.balance !== "all") ||
    filters.categoryId;

  const statusOptions = [
    { value: "all", label: t("filters.all") },
    { value: "active", label: t("filters.active") },
    { value: "inactive", label: t("filters.inactive") },
  ];

  const balanceOptions = [
    { value: "all", label: t("filters.all") },
    { value: "we_owe", label: t("filters.weOwe") },
    { value: "they_owe", label: t("filters.theyOwe") },
  ];

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: i18n.language === "uz" ? c.nameUz : c.nameRu,
  }));

  if (!isOpen) return null;

  return (
    <FiltersBar>
      <FilterItem>
        <Select
          selectSize="small"
          label={t("filters.status")}
          options={statusOptions}
          style={{ padding: "8px" }}
          value={filters.status || "all"}
          onChange={(e) =>
            update({ status: e.target.value as SupplierFilterParams["status"] })
          }
        />
      </FilterItem>

      <FilterItem>
        <Select
          selectSize="small"
          label={t("filters.balance")}
          options={balanceOptions}
          style={{ padding: "8px" }}
          value={filters.balance || "all"}
          onChange={(e) =>
            update({ balance: e.target.value as SupplierFilterParams["balance"] })
          }
        />
      </FilterItem>

      <FilterItem>
        <Select
          selectSize="small"
          label={t("filters.category")}
          placeholder={t("filters.all")}
          options={categoryOptions}
          style={{ padding: "8px" }}
          value={filters.categoryId ? String(filters.categoryId) : ""}
          onChange={(e) =>
            update({
              categoryId: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </FilterItem>

      {hasActiveFilters && (
        <Button variant="secondary" size="medium" onClick={clearFilters}>
          <Eraser size={18} /> {t("filters.clearFilters")}
        </Button>
      )}
    </FiltersBar>
  );
}
