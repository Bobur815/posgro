import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { Trash2, RefreshCw, ArrowLeft } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { PreWeighedItem, Product } from "@shared/types";
import { useNavigate } from "react-router-dom";
import { Button } from "@renderer/components/common/Button";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding-left: 25px;
`;

const BackButton = styled(Button)``;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.md};
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const FiltersRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  align-items: center;
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  flex: 1;
  min-width: 200px;
`;

const RefreshBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  font-size: 14px;
  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const Th = styled.th`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Badge = styled.span<{ $status: "AVAILABLE" | "SOLD" }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) =>
    $status === "AVAILABLE"
      ? theme.colors.success + "20"
      : theme.colors.textSecondary + "20"};
  color: ${({ $status, theme }) =>
    $status === "AVAILABLE"
      ? theme.colors.success
      : theme.colors.textSecondary};
`;

const VoidBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 12px;
  &:hover {
    background: ${({ theme }) => theme.colors.error}10;
  }
`;

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface WeighedItemRow extends Omit<PreWeighedItem, "product"> {
  product?: { nameRu: string; nameUz: string };
}

interface ItemsData {
  items: WeighedItemRow[];
  total: number;
}

export function WeighedInventoryPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<ItemsData>({ items: [], total: 0 });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await window.electronAPI.weighedItems.getAll({
        productId: productFilter ? Number(productFilter) : undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: search || undefined,
        limit: 200,
      })) as ItemsData;
      setData(result || { items: [], total: 0 });
    } catch (err) {
      console.error("Failed to load weighed items:", err);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [productFilter, statusFilter, search, t, toast]);

  useEffect(() => {
    window.electronAPI.products
      .getAll({ active: true })
      .then((prods) => {
        setProducts(
          (prods as Product[]).filter((p) => p.productType === "BULK_WEIGHTED"),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleVoid = async (item: WeighedItemRow) => {
    if (!window.confirm(t("bulkWeigh.confirmVoid"))) return;
    try {
      await window.electronAPI.weighedItems.delete(item.id);
      toast.success(t("bulkWeigh.itemVoided"));
      load();
    } catch (err) {
      console.error("Failed to void item:", err);
      toast.error(t("common.error"));
    }
  };

  const availableItems = data.items.filter((i) => i.status === "AVAILABLE");
  const totalValue = availableItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const today = new Date().toDateString();
  const soldToday = data.items.filter(
    (i) =>
      i.status === "SOLD" &&
      i.soldAt &&
      new Date(i.soldAt).toDateString() === today,
  ).length;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Container>
      <Header>
        <BackButton
          variant="secondary"
          size="small"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft size={20} />
        </BackButton>
        <Title>{t("bulkWeigh.preWeighedInventory")}</Title>
        <RefreshBtn onClick={load}>
          <RefreshCw size={14} />
          {t("common.refresh")}
        </RefreshBtn>
      </Header>

      <StatsRow>
        <StatCard>
          <StatValue>{availableItems.length}</StatValue>
          <StatLabel>{t("bulkWeigh.totalAvailable")}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>
            {Math.round(totalValue).toLocaleString("ru-RU")}{" "}
            {t("common.currency")}
          </StatValue>
          <StatLabel>{t("bulkWeigh.totalValue")}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{soldToday}</StatValue>
          <StatLabel>{t("bulkWeigh.soldToday")}</StatLabel>
        </StatCard>
      </StatsRow>

      <FiltersRow>
        <Select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
        >
          <option value="">{t("bulkWeigh.allProducts")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {i18n.language === "uz" ? p.nameUz : p.nameRu}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">{t("bulkWeigh.allStatuses")}</option>
          <option value="AVAILABLE">{t("inventory.available")}</option>
          <option value="SOLD">{t("inventory.sold")}</option>
        </Select>
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </FiltersRow>

      {loading ? (
        <Empty>{t("common.loading")}</Empty>
      ) : data.items.length === 0 ? (
        <Empty>{t("products.noResults")}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("products.name")}</Th>
              <Th>{t("inventory.quantity")} (кг)</Th>
              <Th>{t("products.barcode")}</Th>
              <Th>{t("products.price")}/кг</Th>
              <Th>{t("pos.total")}</Th>
              <Th>{t("filters.status")}</Th>
              <Th>{t("common.createdAt")}</Th>
              <Th>{t("inventory.sold")}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <Td>
                  {i18n.language === "uz"
                    ? item.product?.nameUz || item.product?.nameRu || "—"
                    : item.product?.nameRu || "—"}
                </Td>
                <Td>{item.weight.toFixed(3)}</Td>
                <Td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                  {item.barcode}
                </Td>
                <Td>{Math.round(item.pricePerKg).toLocaleString("ru-RU")}</Td>
                <Td style={{ fontWeight: 600 }}>
                  {Math.round(item.totalPrice).toLocaleString("ru-RU")}
                </Td>
                <Td>
                  <Badge $status={item.status as "AVAILABLE" | "SOLD"}>
                    {item.status === "AVAILABLE"
                      ? t("inventory.available")
                      : t("inventory.sold")}
                  </Badge>
                </Td>
                <Td>{formatDate(item.createdAt)}</Td>
                <Td>{formatDate(item.soldAt)}</Td>
                <Td>
                  {item.status === "AVAILABLE" && (
                    <VoidBtn onClick={() => handleVoid(item)}>
                      <Trash2 size={12} />
                      {t("bulkWeigh.voidItem")}
                    </VoidBtn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
}
