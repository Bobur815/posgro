import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import { PackageX, Plus, X } from "lucide-react";
import { Table } from "@components/common/Table";
import { Input } from "@components/common/Input";
import { Modal } from "@components/common/Modal";
import { Pagination } from "@components/common/Pagination";
import { EmptyPlaceholder } from "@components/common/EmptyPlaceholder";
import { Button } from "@components/common/Button";
import { useToast } from "@context/ToastContext";
import { formatCurrency } from "@shared/utils";
import { debounce } from "../../utils/helpers";
import { formatDateTime } from "../../utils/formatters";
import {
  writeOffs as writeOffsApi,
  type WriteOffDetail,
  type WriteOffReason,
  type WriteOffSummary,
} from "../../api/client";
import { SubNav, useStockSubNav } from "../../components/layout/SubNav";
import { MobileCard, MobileCardList, DesktopOnly } from "../../components/common/MobileCard";
import { WriteOffFormModal } from "./WriteOffFormModal";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: ${({ theme }) => theme.colors.text};
`;

const Subtitle = styled.div`
  margin-top: -8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SearchWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const ClearBtn = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Chips = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background-color: ${({ theme, $active }) =>
    $active ? `${theme.colors.primary}20` : theme.colors.surface};
  color: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
`;

const ReasonBadge = styled.span<{ $reason: WriteOffReason }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: ${({ theme, $reason }) =>
    $reason === "EXPIRY"
      ? theme.colors.warning
      : $reason === "DAMAGE"
        ? theme.colors.error
        : theme.colors.textSecondary};
`;

const Note = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow-wrap: anywhere;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl} 0;
`;

/* Floating create button — the same as the stocktake list's. */
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 59, 130, 246), 0.5); }
  70% { box-shadow: 0 0 0 12px rgba(var(--primary-rgb, 59, 130, 246), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 59, 130, 246), 0); }
`;

const FAB = styled.button`
  position: fixed;
  bottom: 50px;
  right: 16px;
  z-index: 100;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background-color: ${({ theme }) => theme.colors.primary};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: ${pulse} 2s ease-out infinite;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.1);
  }
  &:active {
    transform: scale(0.95);
  }
`;

const REASON_FILTERS: Array<WriteOffReason | "ALL"> = ["ALL", "EXPIRY", "DAMAGE", "OTHER"];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function WriteOffsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const lang = i18n.language as "ru" | "uz";
  const subNav = useStockSubNav();

  const [rows, setRows] = useState<WriteOffSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [reason, setReason] = useState<WriteOffReason | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<WriteOffDetail | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await writeOffsApi.list({
        search: appliedSearch || undefined,
        reason: reason === "ALL" ? undefined : reason,
        page,
        limit: pageSize,
      });
      setRows(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      toast.error(t("writeOffs.errors.generic", { message: (e as Error).message }));
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, reason, page, pageSize, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = useMemo(
    () =>
      debounce((q: string) => {
        setPage(1);
        setAppliedSearch(q.trim());
      }, 300),
    [],
  );
  useEffect(() => {
    applySearch(searchQuery);
  }, [searchQuery, applySearch]);

  const money = (v: string | number) => formatCurrency(Number(v), lang);
  const reasonBadge = (r: WriteOffReason) => (
    <ReasonBadge $reason={r}>{t(`writeOffs.reasons.${r}`)}</ReasonBadge>
  );

  const openDetail = async (id: string) => {
    try {
      setDetail(await writeOffsApi.get(id));
    } catch (e) {
      toast.error(t("writeOffs.errors.generic", { message: (e as Error).message }));
    }
  };

  const columns = [
    {
      key: "number",
      header: t("writeOffs.number"),
      render: (w: WriteOffSummary) => `#${w.number}`,
    },
    {
      key: "createdAt",
      header: t("writeOffs.date"),
      render: (w: WriteOffSummary) => formatDateTime(w.createdAt),
    },
    {
      key: "reason",
      header: t("writeOffs.reason"),
      render: (w: WriteOffSummary) => (
        <>
          {reasonBadge(w.reason)}
          {w.note && <Note>{w.note}</Note>}
        </>
      ),
    },
    { key: "totalItems", header: t("writeOffs.lines") },
    {
      key: "totalValue",
      header: t("writeOffs.value"),
      render: (w: WriteOffSummary) => money(w.totalValue),
    },
    { key: "createdByName", header: t("writeOffs.author") },
  ];

  type Line = WriteOffDetail["items"][number];
  const lineColumns = [
    {
      key: "product",
      header: t("writeOffs.addProduct"),
      render: (l: Line) => (
        <>
          {lang === "uz" ? l.productNameUz || l.productName : l.productName}
          <Note>{l.barcode}</Note>
        </>
      ),
    },
    {
      key: "quantity",
      header: t("writeOffs.quantity"),
      render: (l: Line) => `${Number(l.quantity)} ${l.unit}`,
    },
    {
      key: "value",
      header: t("writeOffs.value"),
      render: (l: Line) =>
        l.cost === null ? t("writeOffs.noCost") : money(Number(l.cost) * Number(l.quantity)),
    },
  ];

  const isEmpty = !isLoading && rows.length === 0 && !appliedSearch && reason === "ALL";

  return (
    <Container>
      <SubNav items={subNav} />
      <Title>{t("writeOffs.title")}</Title>
      <Subtitle>{t("writeOffs.subtitle")}</Subtitle>

      <SearchWrapper>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("writeOffs.search")}
        />
        {searchQuery && (
          <ClearBtn type="button" onClick={() => setSearchQuery("")} aria-label={t("common.clear")}>
            <X size={16} />
          </ClearBtn>
        )}
      </SearchWrapper>

      <Chips>
        {REASON_FILTERS.map((r) => (
          <Chip
            key={r}
            type="button"
            $active={reason === r}
            onClick={() => {
              setPage(1);
              setReason(r);
            }}
          >
            {r === "ALL" ? t("writeOffs.allReasons") : t(`writeOffs.reasons.${r}`)}
          </Chip>
        ))}
      </Chips>

      {isEmpty ? (
        <EmptyWrapper>
          <EmptyPlaceholder
            icon={<PackageX size={48} />}
            title={t("writeOffs.empty")}
            description={t("writeOffs.subtitle")}
          />
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            {t("writeOffs.new")}
          </Button>
        </EmptyWrapper>
      ) : (
        <>
          <MobileCardList>
            {rows.map((w) => (
              <div key={w.id} onClick={() => void openDetail(w.id)}>
                <MobileCard
                  title={`#${w.number} · ${formatDateTime(w.createdAt)}`}
                  subtitle={w.note ?? undefined}
                  fields={[
                    { label: t("writeOffs.reason"), value: reasonBadge(w.reason) },
                    { label: t("writeOffs.lines"), value: w.totalItems },
                    { label: t("writeOffs.value"), value: money(w.totalValue) },
                    { label: t("writeOffs.author"), value: w.createdByName },
                  ]}
                />
              </div>
            ))}
          </MobileCardList>

          <DesktopOnly>
            <Table
              columns={columns}
              data={rows}
              loading={isLoading}
              emptyMessage={t("common.noResults")}
              onRowClick={(w: WriteOffSummary) => void openDetail(w.id)}
              footer={
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={total}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              }
            />
          </DesktopOnly>
        </>
      )}

      {showCreate && (
        <WriteOffFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(doc) => {
            setShowCreate(false);
            setPage(1);
            void load();
            setDetail(doc);
          }}
        />
      )}

      {detail && (
        <Modal
          title={t("writeOffs.detailTitle", { number: detail.number })}
          onClose={() => setDetail(null)}
        >
          <Meta>
            {reasonBadge(detail.reason)}
            <span>{formatDateTime(detail.createdAt)}</span>
            <span>{detail.createdByName}</span>
            <span>
              {t("writeOffs.total")}: {money(detail.totalValue)}
            </span>
          </Meta>
          {detail.note && <Note style={{ marginBottom: 12 }}>{detail.note}</Note>}
          <Table columns={lineColumns} data={detail.items} />
        </Modal>
      )}

      <FAB
        onClick={() => setShowCreate(true)}
        title={t("writeOffs.new")}
        aria-label={t("writeOffs.new")}
      >
        <Plus size={38} />
      </FAB>
    </Container>
  );
}
