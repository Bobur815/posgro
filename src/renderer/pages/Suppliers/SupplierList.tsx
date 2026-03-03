import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Pagination } from "../../components/common/Pagination";
import { VirtualKeyboard } from "../../components/common/VirtualKeyboard";
import { usePagination } from "../../hooks/usePagination";
import {
  SearchInputWrapper,
  InputControls,
  ClearButton,
  KbToggle,
} from "../../components/common/SearchControls";
import {
  SupplierFilters,
  SupplierFilterParams,
} from "../../components/suppliers/SupplierFilters";
import { SupplierManagementModal } from "./SupplierManagementModal";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useProducts } from "../../hooks/useProducts";
import { useToast } from "../../context/ToastContext";
import { Supplier } from "@shared/types";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { ChevronDown, ChevronUp, CirclePlus, Keyboard, X } from "lucide-react";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  position: relative;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
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

const Filters = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
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
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; view: "list" | "form"; supplier?: Supplier }>({ open: false, view: "list" });
  const [filters, setFilters] = useState<SupplierFilterParams>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    loadSuppliers(true);
    loadProducts();
    loadCategories();
  }, [loadSuppliers, loadProducts, loadCategories]);

  // Build set of supplier IDs per category from products
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

  // Categories that have at least one supplier
  const availableCategories = useMemo(() => {
    return categories.filter((c) => supplierIdsByCategory.has(String(c.id)));
  }, [categories, supplierIdsByCategory]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      // Search filter
      if (q) {
        const matchName =
          supplier.nameRu.toLowerCase().includes(q) ||
          supplier.nameUz.toLowerCase().includes(q);
        const matchPhone = supplier.phone?.toLowerCase().includes(q);
        if (!matchName && !matchPhone) return false;
      }

      // Status filter
      if (filters.status === "active" && !supplier.active) return false;
      if (filters.status === "inactive" && supplier.active) return false;

      // Balance filter
      if (filters.balance === "we_owe" && supplier.balance >= 0) return false;
      if (filters.balance === "they_owe" && supplier.balance <= 0) return false;

      // Category filter
      if (filters.categoryId) {
        const supplierIds = supplierIdsByCategory.get(String(filters.categoryId));
        if (!supplierIds || !supplierIds.has(supplier.id)) return false;
      }

      return true;
    });
  }, [suppliers, filters, supplierIdsByCategory, searchQuery]);

  const {
    pageData,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    pageSizeOptions,
    pageOffset,
    goToPage,
    setPageSize,
  } = usePagination(filteredSuppliers);

  const handleDelete = async (supplier: Supplier) => {
    const success = await deleteSupplier(supplier.id);
    if (success) {
      toast.success(t("suppliers.supplierDeleted"));
      setSupplierToDelete(null);
    } else if (error) {
      toast.error(error);
    }
  };

  const handleVirtualKeyPress = (key: string) => {
    if (key === "BACKSPACE") {
      setSearchQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "ENTER") return;
    setSearchQuery((prev) => prev + key);
  };

  const columns = [
    {
      key: "#",
      header: "#",
      render: (_: Supplier, index: number) => pageOffset + index + 1,
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
            onClick={() => navigate(`/suppliers/${supplier.id}`)}
          >
            {t("suppliers.viewDetails")}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setModalState({ open: true, view: "form", supplier })}
          >
            {t("common.edit")}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => setSupplierToDelete(supplier)}
          >
            {t("common.delete")}
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
        </div>
        <HeaderActions>
          <Button
            style={{ fontSize: "26px" }}
            onClick={() => setModalState({ open: true, view: "form" })}
          >
            <CirclePlus size={24} /> {t("suppliers.addSupplier")}
          </Button>
        </HeaderActions>
      </Header>

      <Filters>
        <SearchInputWrapper>
          <Input
            type="text"
            placeholder={t("common.search")}
            style={{
              padding: "8px 16px",
              fontSize: "18px",
              fontWeight: "bold",
              paddingRight: "60px",
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <InputControls>
            {searchQuery.length > 0 && (
              <ClearButton onClick={() => setSearchQuery("")} tabIndex={-1}>
                <X size={16} />
              </ClearButton>
            )}
            <KbToggle
              type="button"
              tabIndex={-1}
              $active={keyboardOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setKeyboardOpen((prev) => !prev)}
            >
              <Keyboard size={18} />
              {keyboardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </KbToggle>
          </InputControls>
        </SearchInputWrapper>

        <Button
          style={{ padding: "0px 12px" }}
          size="small"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          {t("filters.filters")} {isFilterOpen ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </Filters>

      <SupplierFilters
        filters={filters}
        onChange={setFilters}
        categories={availableCategories as any}
        isOpen={isFilterOpen}
      />

      <Table
        columns={columns}
        data={pageData}
        loading={isLoading}
        emptyMessage={t("suppliers.noSuppliers")}
        footer={
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        }
      />

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

      {modalState.open && (
        <SupplierManagementModal
          initialView={modalState.view}
          initialEditSupplier={modalState.supplier}
          onClose={() => setModalState({ open: false, view: "list" })}
          onSupplierChanged={() => loadSuppliers(true)}
        />
      )}

      {keyboardOpen && (
        <VirtualKeyboard
          fixed
          onKeyPress={handleVirtualKeyPress}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </Container>
  );
}
