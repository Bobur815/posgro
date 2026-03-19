import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { Modal } from "@components/common/Modal";
import { UzbekPhoneInput } from "@components/common/UzbekPhoneInput";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useToast } from "@context/ToastContext";
import { convertUzbekText } from "@shared/utils/transliterator";
import { digitsOnly, formatUzPhone } from "@shared/utils/phone";

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

interface SupplierFormProps {
  supplierId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierForm({ supplierId, onClose, onSuccess }: SupplierFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isEdit = Boolean(supplierId);

  const { getById, createSupplier, updateSupplier, isLoading, error } = useSuppliers();

  const [formData, setFormData] = useState({
    nameRu: "",
    nameUz: "",
    phoneDigits: "",
    balance: "0",
    address: "",
  });

  useEffect(() => {
    if (isEdit && supplierId) {
      loadSupplier();
    }
  }, [supplierId, isEdit]);

  const loadSupplier = async () => {
    if (!supplierId) return;
    const supplier = await getById(supplierId);
    if (supplier) {
      setFormData({
        nameRu: supplier.nameRu,
        nameUz: supplier.nameUz,
        phoneDigits: supplier.phone ? digitsOnly(supplier.phone) : "",
        balance: String(supplier.balance || 0),
        address: supplier.address || "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      phone: formData.phoneDigits ? formatUzPhone(formData.phoneDigits) : undefined,
      address: formData.address || undefined,
      balance: formData.balance ? Number(formData.balance) : 0,
    };

    let success;
    if (isEdit && supplierId) {
      success = await updateSupplier(supplierId, data);
      if (success) toast.success(t("suppliers.supplierUpdated"));
    } else {
      success = await createSupplier(data);
      if (success) toast.success(t("suppliers.supplierCreated"));
    }

    if (success) {
      onSuccess();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameUzChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameUz: value,
        nameRu: prev.nameRu === "" || prev.nameRu === convertUzbekText(prev.nameUz) ? converted : prev.nameRu,
      };
    });
  };

  const handleNameRuChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameRu: value,
        nameUz: prev.nameUz === "" || prev.nameUz === convertUzbekText(prev.nameRu) ? converted : prev.nameUz,
      };
    });
  };

  const title = isEdit ? t("suppliers.editSupplier") : t("suppliers.addSupplier");

  return (
    <Modal title={title} onClose={onClose}>
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
          onDigitsChange={(digits) => setFormData((prev) => ({ ...prev, phoneDigits: digits }))}
        />
        <Input
          label={t("suppliers.balance")}
          value={formData.balance}
          onChange={(e) => handleChange("balance", e.target.value)}
          placeholder="0.00"
        />
        <Input
          label={t("suppliers.address")}
          value={formData.address}
          onChange={(e) => handleChange("address", e.target.value)}
        />
        <Actions>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.nameRu || !formData.nameUz}>
            {isLoading ? t("common.saving") : t("common.save")}
          </Button>
        </Actions>
      </Form>
    </Modal>
  );
}
