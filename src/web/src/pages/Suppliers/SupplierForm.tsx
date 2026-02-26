import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { UzbekPhoneInput } from "@components/common/UzbekPhoneInput";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useToast } from "@context/ToastContext";
import { convertUzbekText } from "@shared/utils/transliterator";

const Container = styled.div`
  max-width: 500px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

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

export function SupplierForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const isEdit = Boolean(id);

  const { getById, createSupplier, updateSupplier, isLoading, error } =
    useSuppliers();

  const [formData, setFormData] = useState({
    nameRu: "",
    nameUz: "",
    phone: "",
    balance: 0,
    address: "",
  });

  useEffect(() => {
    if (isEdit && id) {
      loadSupplier();
    }
  }, [id, isEdit]);

  const loadSupplier = async () => {
    if (!id) return;
    const supplier = await getById(id);
    if (supplier) {
      setFormData({
        nameRu: supplier.nameRu,
        nameUz: supplier.nameUz,
        phone: supplier.phone || "",
        balance: supplier.balance || 0,
        address: supplier.address || "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
    };

    let success;
    if (isEdit && id) {
      success = await updateSupplier(id, data);
      if (success) {
        toast.success(t("suppliers.supplierUpdated"));
      }
    } else {
      success = await createSupplier(data);
      if (success) {
        toast.success(t("suppliers.supplierCreated"));
      }
    }

    if (success) {
      navigate("/suppliers");
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

  return (
    <Container>
      <Title>
        {isEdit ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}
      </Title>

      <Form onSubmit={handleSubmit}>
        <Input
          label={t("suppliers.nameUz")}
          value={formData.nameUz}
          onChange={(e) => handleNameUzChange(e.target.value)}
          required
        />

        <Input
          label={t("suppliers.nameRu")}
          value={formData.nameRu}
          onChange={(e) => handleNameRuChange(e.target.value)}
          required
        />

        <UzbekPhoneInput
          label={t("suppliers.phone")}
          valueDigits={formData.phone}
          onDigitsChange={(digits) =>
            setFormData((prev) => ({ ...prev, phone: digits }))
          }
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/suppliers")}
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
    </Container>
  );
}
