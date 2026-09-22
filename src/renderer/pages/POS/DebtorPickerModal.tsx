import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Plus, Search, UserPlus, X } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { UzbekPhoneInput } from "../../components/common/UzbekPhoneInput";
import { DateInput } from "../../components/common/DateInput";
import { useToast } from "../../context/ToastContext";
import { formatCurrency } from "@shared/utils";
import { isUzPhoneComplete } from "@shared/utils/phone";
import { roleLabelKey, USER_ROLES } from "@shared/constants";
import type { Debtor } from "@shared/types";
import { useModeStore } from "../../store";

/**
 * Put part or all of a sale on someone's tab.
 *
 * Two things happen on one screen because they happen together at a counter: the cashier finds
 * the person, and says how much of this receipt they are not paying for now. The amount defaults
 * to the whole total — the common case is "put it all on my account" — but stays editable, so
 * someone can hand over what they have and owe the rest.
 *
 * The list is everyone on this till, staff included: a cashier or an admin can run a tab for
 * their own store. Staff are tagged with their role, because "Alisher the cashier" and "Alisher
 * the customer" are otherwise the same row.
 *
 * Adding a customer is inline rather than a second modal: the moment you discover someone is not
 * in the list is the moment you are standing in front of them.
 */

const Bar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SearchWrap = styled.div`
  position: relative;
  flex: 1;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.textSecondary};
    pointer-events: none;
  }

  input {
    padding-left: 34px;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Row = styled.button<{ $selected: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1.5px solid
    ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) =>
    $selected ? `${theme.colors.primary}12` : theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Who = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NameRow = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Name = styled.span`
  font-weight: 600;
  font-size: 14px;
`;

/** Marks a member of staff, so a cashier named Alisher is not mistaken for a customer of that name. */
const StaffTag = styled.span`
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  background: ${({ theme }) => theme.colors.primary}18;
  color: ${({ theme }) => theme.colors.primary};
`;

const Phone = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Owed = styled.span<{ $owing: boolean }>`
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  color: ${({ $owing, theme }) => ($owing ? theme.colors.error : theme.colors.textSecondary)};
`;

const Empty = styled.div`
  padding: 24px 12px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const AddForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const AmountRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

export interface DebtSelection {
  debtor: Debtor;
  /** How much of the receipt goes on the tab. The rest is paid now, on the chosen tender. */
  debtAmount: number;
  /** When this was agreed to be paid, if anything was agreed. ISO date, or null. */
  debtDueDate: string | null;
}

interface Props {
  total: number;
  onConfirm: (selection: DebtSelection) => void;
  onCancel: () => void;
}

export function DebtorPickerModal({ total, onConfirm, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(total));
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  // A satellite picks from the main's people and cannot add one: customers are the main's to keep.
  const isSatellite = useModeStore((s) => s.isSatellite);

  useEffect(() => {
    let alive = true;
    window.electronAPI.debtors
      // Staff included: a cashier or admin can run a tab for their own store.
      .list({ search, includeStaff: true })
      .then((rows) => {
        if (alive) setDebtors(rows);
      })
      .catch(() => {
        if (alive) setDebtors([]);
      });
    return () => {
      alive = false;
    };
  }, [search]);

  const selected = useMemo(
    () => debtors.find((d) => d.id === selectedId) ?? null,
    [debtors, selectedId],
  );

  // Picking someone offers the date they already agreed to, rather than an empty field the
  // cashier retypes for every receipt on the same tab.
  useEffect(() => {
    if (!selected?.debtDueDate) return;
    setDueDate(new Date(selected.debtDueDate).toISOString().slice(0, 10));
  }, [selected]);

  const debtAmount = Number(amount) || 0;
  const paidNow = Math.max(0, total - debtAmount);
  const amountValid = debtAmount > 0 && debtAmount <= total;

  const handleAdd = async () => {
    const name = newName.trim();
    // UzbekPhoneInput holds the nine national digits; the country code belongs to the number the
    // database stores, which is what every other phone in this app looks like.
    if (!name || !isUzPhoneComplete(newPhone)) {
      toast.error(t("debtors.nameAndPhoneRequired", "Укажите имя и полный номер телефона"));
      return;
    }
    const phone = `998${newPhone}`;

    setBusy(true);
    try {
      const created = await window.electronAPI.debtors.create({ nameRu: name, phone });
      // Straight into the selection: adding someone at the counter is always the first step of
      // putting this receipt on their tab.
      setDebtors((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setAdding(false);
      setNewName("");
      setNewPhone("");
    } catch (e) {
      const key = e instanceof Error ? e.message : "";
      toast.error(
        key.includes("phone_taken")
          ? t("debtors.phoneTaken", "Этот номер уже занят")
          : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("debtors.sellOnCredit", "Продажа в долг")} onClose={onCancel} width="560px">
      <Bar>
        <SearchWrap>
          <Search size={16} />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("debtors.searchPlaceholder", "Имя или телефон")}
          />
        </SearchWrap>
        {!isSatellite && (
          <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
            {adding ? <X size={16} /> : <Plus size={16} />}
            {adding ? t("common.cancel") : t("common.add", "Добавить")}
          </Button>
        )}
      </Bar>

      {adding && !isSatellite && (
        <AddForm>
          <Input
            label={t("debtors.name", "Имя")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("debtors.namePlaceholder", "Например: Алишер")}
          />
          <UzbekPhoneInput
            label={t("debtors.phone", "Телефон")}
            valueDigits={newPhone}
            onDigitsChange={setNewPhone}
            onEnter={handleAdd}
          />
          <Button onClick={handleAdd} disabled={busy}>
            <UserPlus size={16} /> {t("debtors.addClient", "Добавить клиента")}
          </Button>
        </AddForm>
      )}

      <List>
        {debtors.length === 0 ? (
          <Empty>
            {search
              ? t("debtors.nothingFound", "Никого не найдено")
              : t("debtors.noneYet", "Клиентов пока нет — добавьте первого")}
          </Empty>
        ) : (
          debtors.map((d) => (
            <Row
              key={d.id}
              type="button"
              $selected={d.id === selectedId}
              onClick={() => setSelectedId(d.id)}
            >
              <Who>
                <NameRow>
                  <Name>{i18n.language === "uz" ? d.nameUz : d.nameRu}</Name>
                  {/* Staff can run a tab for their own store, so they are pickable here — and
                      have to be identifiable as staff while picking. */}
                  {d.role !== USER_ROLES.CLIENT && (
                    <StaffTag>{t(roleLabelKey(d.role), { defaultValue: d.role })}</StaffTag>
                  )}
                </NameRow>
                <Phone>{d.phone}</Phone>
              </Who>
              {/* Their existing balance, so nobody is handed a fourth sack of flour by accident. */}
              <Owed $owing={d.debt > 0}>
                {d.debt > 0 ? formatCurrency(d.debt) : t("debtors.noDebt", "нет долга")}
              </Owed>
            </Row>
          ))
        )}
      </List>

      <AmountRow>
        <Label>{t("debtors.amountOnCredit", "Сумма в долг")}</Label>
        <Input
          value={amount}
          inputMode="numeric"
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <DateInput
          label={t("debtors.dueDateOptional", "Срок оплаты (необязательно)")}
          value={dueDate}
          onChange={setDueDate}
          style={{ marginTop: 8 }}
        />
        <Hint>
          {paidNow > 0
            ? t("debtors.splitHint", {
                defaultValue: "Сейчас к оплате: {{paid}} · В долг: {{debt}}",
                paid: formatCurrency(paidNow),
                debt: formatCurrency(debtAmount),
              })
            : t("debtors.wholeReceiptHint", "Весь чек уходит в долг")}
        </Hint>
      </AmountRow>

      <Actions>
        <Button variant="secondary" onClick={onCancel} fullWidth>
          {t("common.cancel")}
        </Button>
        <Button
          fullWidth
          disabled={!selected || !amountValid || busy}
          onClick={() =>
            selected &&
            onConfirm({ debtor: selected, debtAmount, debtDueDate: dueDate || null })
          }
        >
          {t("debtors.confirmCredit", "Оформить в долг")}
        </Button>
      </Actions>
    </Modal>
  );
}
