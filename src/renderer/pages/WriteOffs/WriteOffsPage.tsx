import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { CirclePlus } from "lucide-react";
import { formatCurrency } from "@shared/utils";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { Pagination } from "../../components/common/Pagination";
import { formatDateTime, formatQuantity } from "../../utils/formatters";
import { useWriteOffs, type WriteOffDetail, type WriteOffSummary } from "../../hooks/useWriteOffs";
import { WriteOffFormModal } from "./WriteOffFormModal";

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  color: ${({ theme }) => theme.colors.text};
`;

const Subtitle = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xs};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ReasonBadge = styled.span<{ $reason: string }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 13px;
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
  margin-top: 2px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const PAGE_SIZE = 20;

export function WriteOffsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "ru" | "uz";
  const { page, isLoading, error, load, create, get } = useWriteOffs();
  const [pageNumber, setPageNumber] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<WriteOffDetail | null>(null);

  useEffect(() => {
    void load({ page: pageNumber });
  }, [load, pageNumber]);

  const money = (value: string | number) => formatCurrency(Number(value), lang);

  const columns = [
    { key: "number", header: t("writeOffs.number"), render: (w: WriteOffSummary) => w.number },
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
          <ReasonBadge $reason={w.reason}>{t(`writeOffs.reasons.${w.reason}`)}</ReasonBadge>
          {w.note && <Note>{w.note}</Note>}
        </>
      ),
    },
    {
      key: "totalItems",
      header: t("writeOffs.lines"),
      render: (w: WriteOffSummary) => w.totalItems,
    },
    {
      key: "totalValue",
      header: t("writeOffs.value"),
      render: (w: WriteOffSummary) => money(w.totalValue),
    },
    { key: "createdByName", header: t("writeOffs.author") },
  ];

  const lineColumns = [
    {
      key: "product",
      header: t("writeOffs.addProduct"),
      render: (l: WriteOffDetail["items"][number]) =>
        lang === "uz" ? l.productNameUz : l.productName,
    },
    { key: "barcode", header: "", render: (l: WriteOffDetail["items"][number]) => l.barcode },
    {
      key: "quantity",
      header: t("writeOffs.quantity"),
      render: (l: WriteOffDetail["items"][number]) =>
        formatQuantity(Number(l.quantity), l.unit, lang),
    },
    {
      key: "value",
      header: t("writeOffs.value"),
      render: (l: WriteOffDetail["items"][number]) =>
        l.cost === null ? t("writeOffs.noCost") : money(Number(l.cost) * Number(l.quantity)),
    },
  ];

  return (
    <Container>
      <Header>
        <div>
          <Title>{t("writeOffs.title")}</Title>
          <Subtitle>{t("writeOffs.subtitle")}</Subtitle>
        </div>
        <Button style={{ fontSize: "20px" }} onClick={() => setFormOpen(true)}>
          <CirclePlus size={22} /> {t("writeOffs.new")}
        </Button>
      </Header>

      {error && <Note role="alert">{t("writeOffs.errors.generic", { message: error })}</Note>}

      <Table
        columns={columns}
        data={page?.rows ?? []}
        loading={isLoading}
        emptyMessage={t("writeOffs.empty")}
        onRowClick={async (w) => setDetail(await get(w.id))}
      />

      {page && page.totalPages > 1 && (
        <Pagination
          currentPage={page.page}
          totalPages={page.totalPages}
          totalItems={page.total}
          pageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
          onPageChange={setPageNumber}
          onPageSizeChange={() => undefined}
        />
      )}

      {formOpen && (
        <WriteOffFormModal
          create={create}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setPageNumber(1);
            void load({ page: 1 });
          }}
        />
      )}

      {detail && (
        <Modal
          title={t("writeOffs.detailTitle", { number: detail.number })}
          onClose={() => setDetail(null)}
          width="760px"
        >
          <Meta>
            <ReasonBadge $reason={detail.reason}>
              {t(`writeOffs.reasons.${detail.reason}`)}
            </ReasonBadge>
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
    </Container>
  );
}
