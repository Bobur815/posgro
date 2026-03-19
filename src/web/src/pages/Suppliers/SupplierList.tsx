import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Table } from "@components/common/Table";
import { Button } from "@components/common/Button";
import { ConfirmDialog } from "@components/common/ConfirmDialog";
import {
  SupplierFilters,
  SupplierFilterParams,
} from "@components/suppliers/SupplierFilters";
import { SupplierForm } from "./SupplierForm";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useProducts } from "../../hooks/useProducts";
import { useToast } from "@context/ToastContext";
import { Supplier } from "@shared/types";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import {
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Eye,
  Edit,
  Trash,
} from "lucide-react";
import {
  MobileCard,
  MobileCardList,
  DesktopOnly,
} from "../../components/common/MobileCard";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
`;

const Badge = styled.span<{ $active?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.success : theme.colors.error};
  color: white;
`;

const BalanceBadge = styled.span<{ $positive?: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success + "20" : theme.colors.error + "20"};
  color: ${({ theme, $positive }) =>
    $positive ? theme.colors.success : theme.colors.error};
`;

export function SupplierList() {
  const { t, i18n } = useTranslation();
  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");
  const navigate = useNavigate();
  const toast = useToast();
  const { suppliers, isLoading, loadSuppliers, deleteSupplier, error } =
    useSuppliers();
  const { products, categories, loadProducts, loadCategories } = useProducts();
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(
    null,
  );
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SupplierFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    loadSuppliers(true);
    loadProducts();
    loadCategories();
  }, [loadSuppliers, loadProducts, loadCategories]);

  const supplierIdsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const product of products) {
      if (product.supplierId && product.categoryId) {
        const catKey = String(product.categoryId);
        if (!map.has(catKey)) {
          map.set(catKey, new Set());
        }
        map.get(catKey)!.add(product.supplierId);
      }
    }
    return map;
  }, [products]);

  const availableCategories = useMemo(() => {
    return categories.filter((c) => supplierIdsByCategory.has(String(c.id)));
  }, [categories, supplierIdsByCategory]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      if (filters.status === "active" && !supplier.active) return false;
      if (filters.status === "inactive" && supplier.active) return false;
      if (filters.balance === "we_owe" && supplier.balance >= 0) return false;
      if (filters.balance === "they_owe" && supplier.balance <= 0) return false;
      if (filters.categoryId) {
        const supplierIds = supplierIdsByCategory.get(
          String(filters.categoryId),
        );
        if (!supplierIds || !supplierIds.has(supplier.id)) return false;
      }
      return true;
    });
  }, [suppliers, filters, supplierIdsByCategory]);

  const handleDelete = async (supplier: Supplier) => {
    const success = await deleteSupplier(supplier.id);
    if (success) {
      toast.success(t("suppliers.supplierDeleted"));
      setSupplierToDelete(null);
    } else if (error) {
      toast.error(error);
    }
  };

  const columns = [
    {
      key: "#",
      header: "#",
      render: (_: Supplier, index: number) => index + 1,
    },
    {
      key: "name",
      header: t("suppliers.supplier"),
      render: (supplier: Supplier) =>
        i18n.language === "uz" ? supplier.nameUz : supplier.nameRu,
    },
    {
      key: "phone",
      header: t("suppliers.phone"),
      render: (supplier: Supplier) => supplier.phone || "-",
    },
    {
      key: "balance",
      header: t("suppliers.balance"),
      render: (supplier: Supplier) => (
        <BalanceBadge $positive={supplier.balance >= 0}>
          {supplier.balance < 0
            ? `${t("suppliers.weOwe")}: ${formatCurrency(Math.abs(supplier.balance))}`
            : supplier.balance > 0
              ? `${t("suppliers.theyOwe")}: ${formatCurrency(supplier.balance)}`
              : formatCurrency(0)}
        </BalanceBadge>
      ),
    },
    {
      key: "active",
      header: t("users.status"),
      render: (supplier: Supplier) => (
        <Badge $active={supplier.active}>
          {supplier.active ? t("suppliers.active") : t("suppliers.inactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (supplier: Supplier) => (
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            size="small"
            variant="secondary"
            tooltip={t("common.edit")}
            onClick={() => setEditSupplierId(supplier.id)}
          >
            <Edit size={16} />
          </Button>

          <Button
            size="small"
            variant="danger"
            tooltip={t("common.delete")}
            onClick={() => setSupplierToDelete(supplier)}
          >
            <Trash size={16} />
          </Button>

          <Button
            size="small"
            variant="primary"
            tooltip={t("suppliers.viewDetails")}
            onClick={() => navigate(`/suppliers/${supplier.id}`)}
          >
            <Eye size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Title>{t("suppliers.title")}</Title>
          <Button
            style={{ padding: "8px 12px" }}
            size="small"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            {t("filters.filters")}{" "}
            {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
        <HeaderActions>
          <Button onClick={() => setShowSupplierForm(true)}>
            <PlusCircle size={24} /> {t("suppliers.addSupplier")}
          </Button>
        </HeaderActions>
      </Header>

      <SupplierFilters
        filters={filters}
        onChange={setFilters}
        categories={availableCategories as any}
        isOpen={isFilterOpen}
      />

      <MobileCardList>
        {filteredSuppliers.map((supplier) => (
          <MobileCard
            key={supplier.id}
            title={i18n.language === "uz" ? supplier.nameUz : supplier.nameRu}
            subtitle={supplier.phone || undefined}
            fields={[
              {
                label: t("suppliers.balance"),
                value: (
                  <BalanceBadge $positive={supplier.balance >= 0}>
                    {supplier.balance < 0
                      ? `${t("suppliers.weOwe")}: ${formatCurrency(Math.abs(supplier.balance))}`
                      : supplier.balance > 0
                        ? `${t("suppliers.theyOwe")}: ${formatCurrency(supplier.balance)}`
                        : formatCurrency(0)}
                  </BalanceBadge>
                ),
              },
              {
                label: t("users.status"),
                value: (
                  <Badge $active={supplier.active}>
                    {supplier.active
                      ? t("suppliers.active")
                      : t("suppliers.inactive")}
                  </Badge>
                ),
              },
            ]}
            actions={
              <>
                <Button
                  size="small"
                  variant="secondary"
                  tooltip={t("suppliers.viewDetails")}
                  onClick={() => navigate(`/suppliers/${supplier.id}`)}
                >
                  <Eye size={16} />
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  tooltip={t("common.edit")}
                  onClick={() => setEditSupplierId(supplier.id)}
                >
                  <Edit size={16} />
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  tooltip={t("common.delete")}
                  onClick={() => setSupplierToDelete(supplier)}
                >
                  <Trash size={16} />
                </Button>
              </>
            }
          />
        ))}
      </MobileCardList>

      <DesktopOnly>
        <Table
          columns={columns}
          data={filteredSuppliers}
          loading={isLoading}
          emptyMessage={t("suppliers.noSuppliers")}
        />
      </DesktopOnly>

      {supplierToDelete && (
        <ConfirmDialog
          title={t("common.delete")}
          message={t("suppliers.confirmDelete")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={() => handleDelete(supplierToDelete)}
          onCancel={() => setSupplierToDelete(null)}
        />
      )}

      {showSupplierForm && (
        <SupplierForm
          onClose={() => setShowSupplierForm(false)}
          onSuccess={() => {
            setShowSupplierForm(false);
            loadSuppliers(true);
          }}
        />
      )}

      {editSupplierId && (
        <SupplierForm
          supplierId={editSupplierId}
          onClose={() => setEditSupplierId(null)}
          onSuccess={() => {
            setEditSupplierId(null);
            loadSuppliers(true);
          }}
        />
      )}
    </Container>
  );
}
