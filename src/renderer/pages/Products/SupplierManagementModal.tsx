import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useToast } from "../../context/ToastContext";
import { Supplier } from "@shared/types";
import { convertUzbekText } from "@shared/utils/transliterator";
import { UzbekPhoneInput } from "../../components/common/UzbekPhoneInput";
import { digitsOnly, formatUzPhone } from "@shared/utils/phone";
import { Pencil, Trash2, Plus, ArrowLeft, CirclePlus } from "lucide-react";

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SupplierRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
`;

const SupplierInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SupplierName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const SupplierMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const RowActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const IconButton = styled.button<{ $variant?: "danger" }>`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 6px;
  cursor: pointer;
  color: ${({ theme, $variant }) =>
    $variant === "danger" ? theme.colors.error : theme.colors.textSecondary};
  display: flex;
  align-items: center;

  &:hover {
    background-color: ${({ theme, $variant }) =>
      $variant === "danger"
        ? theme.colors.error + "10"
        : theme.colors.background};
  }
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface SupplierManagementModalProps {
  onClose: () => void;
  onSupplierChanged: () => void;
}

type View = "list" | "form";

export function SupplierManagementModal({
  onClose,
  onSupplierChanged,
}: SupplierManagementModalProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const {
    suppliers,
    loadSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    isLoading,
  } = useSuppliers();

  const [view, setView] = useState<View>("list");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(
    null,
  );
  const [formData, setFormData] = useState({
    nameRu: "",
    nameUz: "",
    phoneDigits: "",
    address: "",
  });

  useEffect(() => {
    loadSuppliers(true);
  }, [loadSuppliers]);

  const openCreateForm = () => {
    setEditingSupplier(null);
    setFormData({ nameRu: "", nameUz: "", phoneDigits: "", address: "" });
    setView("form");
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      nameRu: supplier.nameRu,
      nameUz: supplier.nameUz,
      phoneDigits: supplier.phone ? digitsOnly(supplier.phone) : "",
      address: supplier.address || "",
    });
    setView("form");
  };

  const handleNameUzChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameUz: value,
        nameRu:
          prev.nameRu === "" || prev.nameRu === convertUzbekText(prev.nameUz)
            ? converted
            : prev.nameRu,
      };
    });
  };

  const handleNameRuChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameRu: value,
        nameUz:
          prev.nameUz === "" || prev.nameUz === convertUzbekText(prev.nameRu)
            ? converted
            : prev.nameUz,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      phone: formData.phoneDigits
        ? formatUzPhone(formData.phoneDigits)
        : undefined,
      address: formData.address || undefined,
    };

    let success;
    if (editingSupplier) {
      success = await updateSupplier(editingSupplier.id, data);
      if (success) toast.success(t("suppliers.supplierUpdated"));
    } else {
      success = await createSupplier(data);
      if (success) toast.success(t("suppliers.supplierCreated"));
    }

    if (success) {
      onSupplierChanged();
      setView("list");
    }
  };

  const handleDelete = async () => {
    if (!supplierToDelete) return;
    const success = await deleteSupplier(supplierToDelete.id);
    if (success) {
      toast.success(t("suppliers.supplierDeleted"));
      onSupplierChanged();
      setSupplierToDelete(null);
    }
  };

  const getSupplierName = (supplier: Supplier) =>
    i18n.language === "uz" ? supplier.nameUz : supplier.nameRu;

  const title =
    view === "form"
      ? editingSupplier
        ? t("suppliers.editSupplier")
        : t("suppliers.addSupplier")
      : t("suppliers.title");

  return (
    <>
      <Modal title={title} onClose={onClose} width="500px">
        {view === "list" ? (
          <>
            <TopBar>
              <div />
              <Button size="small" onClick={openCreateForm}>
                <CirclePlus size={24} /> {t("suppliers.addSupplier")}
              </Button>
            </TopBar>
            <List>
              {suppliers.length === 0 ? (
                <EmptyMessage>{t("suppliers.noSuppliers")}</EmptyMessage>
              ) : (
                suppliers.map((supplier) => (
                  <SupplierRow key={supplier.id}>
                    <SupplierInfo>
                      <SupplierName>{getSupplierName(supplier)}</SupplierName>
                      {supplier.phone && (
                        <SupplierMeta>{supplier.phone}</SupplierMeta>
                      )}
                    </SupplierInfo>
                    <RowActions>
                      <IconButton onClick={() => openEditForm(supplier)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        $variant="danger"
                        onClick={() => setSupplierToDelete(supplier)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </RowActions>
                  </SupplierRow>
                ))
              )}
            </List>
          </>
        ) : (
          <>
            <BackButton onClick={() => setView("list")}>
              <ArrowLeft size={14} /> {t("suppliers.title")}
            </BackButton>
            <Form onSubmit={handleSubmit}>
              <Input
                label={t("suppliers.nameUz")}
                value={formData.nameUz}
                onChange={(e) => handleNameUzChange(e.target.value)}
                required
                autoFocus
              />
              <Input
                label={t("suppliers.nameRu")}
                value={formData.nameRu}
                onChange={(e) => handleNameRuChange(e.target.value)}
                required
              />
              <UzbekPhoneInput
                label={t("suppliers.phone")}
                valueDigits={formData.phoneDigits}
                onDigitsChange={(digits) =>
                  setFormData((prev) => ({ ...prev, phoneDigits: digits }))
                }
              />
              <Input
                label={t("suppliers.address")}
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
              />
              <Actions>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setView("list")}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !formData.nameRu || !formData.nameUz}
                >
                  {isLoading ? t("common.saving") : t("common.save")}
                </Button>
              </Actions>
            </Form>
          </>
        )}
      </Modal>

      {supplierToDelete && (
        <ConfirmDialog
          title={t("common.delete")}
          message={t("suppliers.confirmDelete")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setSupplierToDelete(null)}
        />
      )}
    </>
  );
}
