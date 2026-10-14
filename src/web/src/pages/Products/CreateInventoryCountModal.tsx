import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { Select } from "@components/common/Select";
import { useProducts } from "../../hooks/useProducts";
import { useToast } from "@context/ToastContext";
import { inventoryCounts, type InventoryCountScope } from "../../api/client";

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

const Count = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const LinkButton = styled.button`
  min-height: 32px;
  padding: 0 ${({ theme }) => theme.spacing.xs};
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`;

/* Scrolls on its own so a store with many categories doesn't push Save off the modal. */
const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const CategoryOption = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }

  input {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;

  @media (max-width: 640px) {
    flex-direction: column-reverse;
  }
`;

interface CreateInventoryCountModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateInventoryCountModal({
  onClose,
  onCreated,
}: CreateInventoryCountModalProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { categories, loadCategories } = useProducts();

  const [scope, setScope] = useState<InventoryCountScope>("FULL");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (scope === "CATEGORY" && categoryIds.length === 0) return;

    setIsSaving(true);
    try {
      const created = await inventoryCounts.create({
        scope,
        ...(scope === "CATEGORY" ? { categoryIds } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t("inventoryCount.created"));
      onCreated(created.id);
    } catch (err) {
      // The server rejects a second open document by design — surface its reason.
      const message = err instanceof Error ? err.message : "";
      toast.error(
        message.toLowerCase().includes("already exists")
          ? t("inventoryCount.alreadyOpen")
          : t("inventoryCount.createError"),
      );
      setIsSaving(false);
    }
  };

  const toggleCategory = (id: number, checked: boolean) =>
    setCategoryIds((prev) =>
      checked ? [...prev, id] : prev.filter((c) => c !== id),
    );

  const allSelected =
    categories.length > 0 && categoryIds.length === categories.length;

  return (
    <Modal title={t("inventoryCount.create")} onClose={onClose}>
      <Form onSubmit={handleSubmit}>
        <Select
          label={t("inventoryCount.scope.label")}
          value={scope}
          onChange={(e) => setScope(e.target.value as InventoryCountScope)}
          options={[
            { value: "FULL", label: t("inventoryCount.scope.full") },
            { value: "CATEGORY", label: t("inventoryCount.scope.category") },
          ]}
        />

        {scope === "CATEGORY" && (
          <Field>
            <FieldHeader>
              <span>
                {t("inventoryCount.form.categories")}{" "}
                <Count>
                  {categoryIds.length > 0
                    ? t("inventoryCount.form.selectedCount", {
                        n: categoryIds.length,
                      })
                    : t("inventoryCount.form.selectCategory")}
                </Count>
              </span>
              <LinkButton
                type="button"
                onClick={() =>
                  setCategoryIds(allSelected ? [] : categories.map((c) => c.id))
                }
              >
                {allSelected
                  ? t("inventoryCount.form.clearAll")
                  : t("inventoryCount.form.selectAll")}
              </LinkButton>
            </FieldHeader>
            <CategoryList>
              {categories.map((c) => (
                <CategoryOption key={c.id}>
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(c.id)}
                    onChange={(e) => toggleCategory(c.id, e.target.checked)}
                  />
                  {i18n.language === "uz" ? c.nameUz : c.nameRu}
                </CategoryOption>
              ))}
            </CategoryList>
          </Field>
        )}

        <Input
          label={t("inventoryCount.form.note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("inventoryCount.form.notePlaceholder")}
          maxLength={500}
        />

        <Actions>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              isSaving || (scope === "CATEGORY" && categoryIds.length === 0)
            }
          >
            {isSaving ? t("common.saving") : t("inventoryCount.form.submit")}
          </Button>
        </Actions>
      </Form>
    </Modal>
  );
}
