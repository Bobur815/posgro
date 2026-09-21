import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { formatDate } from "../../utils/formatters";
import { UserFormModal } from "./UserFormModal";
import type { UserListItem } from "@shared/types";
import { roleLabelKey } from "@shared/constants/roles";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { DebtorDetails } from "../Debtors/DebtorDetails";
import { ArrowLeft, Edit, Plus, UserCheck, UserX, Wallet } from "lucide-react";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BackButton = styled(Button)``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 25px;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
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

/**
 * A member of staff's own tab.
 *
 * Shown as a button, not a label: the useful next action on "Алишер owes 80 000" is taking his
 * money, and that lives one click away in the same ledger the debtors page opens. Muted to
 * nothing when the balance is zero, so a screen of staff who owe nothing stays quiet.
 */
const DebtButton = styled.button<{ $owing: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: ${({ $owing }) => ($owing ? 700 : 400)};
  cursor: ${({ $owing }) => ($owing ? "pointer" : "default")};
  border: 1px solid
    ${({ $owing, theme }) => ($owing ? theme.colors.error : "transparent")};
  background: ${({ $owing, theme }) => ($owing ? `${theme.colors.error}14` : "transparent")};
  color: ${({ $owing, theme }) =>
    $owing ? theme.colors.error : theme.colors.textSecondary};
`;

const RoleBadge = styled.span<{ $role: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background-color: ${({ theme, $role }) =>
    $role === "ADMIN" ? theme.colors.primary : theme.colors.secondary};
  color: white;
`;

export function UserList() {
  const { t, i18n } = useTranslation();
  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userToToggle, setUserToToggle] = useState<UserListItem | null>(null);
  // Add and edit both happen in a modal over this list, the way supplier management does — an
  // admin renaming a cashier keeps the table they were reading behind the dialog. `user`
  // undefined means "create".
  const [formState, setFormState] = useState<{
    open: boolean;
    user?: UserListItem;
  }>({ open: false });
  /** Whose tab is open, if any — the same ledger the debtors page shows. */
  const [debtUserId, setDebtUserId] = useState<string | null>(null);
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await window.electronAPI.users.getAll();
      setUsers(data as UserListItem[]);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (user: UserListItem) => {
    try {
      await window.electronAPI.users.update(user.id, { active: !user.active });
      loadUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
    }
  };

  const columns = [
    { key: "phone", header: t("users.phone") },
    {
      key: "name",
      header: t("users.name"),
      render: (user: UserListItem) =>
        i18n.language === "uz" ? user.nameUz : user.nameRu,
    },
    {
      key: "role",
      header: t("users.role"),
      render: (user: UserListItem) => (
        <RoleBadge $role={user.role}>
          {t(roleLabelKey(user.role), { defaultValue: user.role })}
        </RoleBadge>
      ),
    },
    {
      key: "debt",
      header: t("debtors.debt", "Долг"),
      render: (user: UserListItem) => {
        const debt = user.debt ?? 0;
        // Negative is money paid ahead, not a debt, and must not be shown in red as one.
        const owing = debt > 0;
        return (
          <DebtButton
            type="button"
            $owing={owing}
            disabled={debt === 0}
            onClick={() => debt !== 0 && setDebtUserId(user.id)}
            title={owing ? t("debtors.takePayment", "Принять оплату") : undefined}
          >
            {owing && <Wallet size={13} />}
            {debt === 0
              ? "—"
              : debt < 0
                ? t("debtors.prepaid", {
                    defaultValue: "аванс {{amount}}",
                    amount: formatCurrency(-debt),
                  })
                : formatCurrency(debt)}
          </DebtButton>
        );
      },
    },
    {
      key: "active",
      header: t("users.status"),
      render: (user: UserListItem) => (
        <Badge $active={user.active}>
          {user.active ? t("users.active") : t("users.inactive")}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: t("users.createdAt"),
      render: (user: UserListItem) => formatDate(user.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (user: UserListItem) => (
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            size="small"
            variant="secondary"
            tooltip={t("common.edit")}
            onClick={() => setFormState({ open: true, user })}
          >
            <Edit size={16} />
          </Button>
          <Button
            size="small"
            variant={user.active ? "danger" : "primary"}
            tooltip={user.active ? t("users.deactivate") : t("users.activate")}
            onClick={() => setUserToToggle(user)}
          >
            {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
          </Button>
        </div>
      ),
    },
  ];

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
        <Title>{t("users.title")}</Title>
        <Button onClick={() => setFormState({ open: true })}>
          <Plus size={16} />
          {t("users.addUser")}
        </Button>
      </Header>

      <Table
        columns={columns}
        data={users}
        loading={isLoading}
        emptyMessage={t("users.noUsers")}
      />

      {formState.open && (
        <UserFormModal
          // Remount on target change so the form state is rebuilt from the user being edited
          // rather than carried over from whoever was open before.
          key={formState.user?.id ?? "new"}
          user={formState.user}
          onClose={() => setFormState({ open: false })}
          onSaved={loadUsers}
        />
      )}

      {userToToggle && (
        <ConfirmDialog
          title={
            userToToggle.active ? t("users.deactivate") : t("users.activate")
          }
          message={
            userToToggle.active
              ? t("users.deactivateConfirm", {
                  name:
                    i18n.language === "uz"
                      ? userToToggle.nameUz
                      : userToToggle.nameRu,
                })
              : t("users.activateConfirm", {
                  name:
                    i18n.language === "uz"
                      ? userToToggle.nameUz
                      : userToToggle.nameRu,
                })
          }
          confirmLabel={
            userToToggle.active ? t("users.deactivate") : t("users.activate")
          }
          cancelLabel={t("common.cancel")}
          variant={userToToggle.active ? "danger" : "primary"}
          onConfirm={() => {
            handleToggleActive(userToToggle);
            setUserToToggle(null);
          }}
          onCancel={() => setUserToToggle(null)}
        />
      )}

      {/* The same ledger the debtors page opens, so taking a payment from a cashier and taking
          one from a customer are the same screen and the same rules. */}
      {debtUserId && (
        <DebtorDetails
          debtorId={debtUserId}
          onClose={() => {
            setDebtUserId(null);
            // A payment may have moved the balance shown in the row behind.
            loadUsers();
          }}
        />
      )}
    </Container>
  );
}
