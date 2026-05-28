import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { X } from "lucide-react";
import { stores, StoreRecord } from "../../api/client";
import { UzbekPhoneInput } from "@components/common/UzbekPhoneInput";
import { phoneToDigits, normalizeUzPhone } from "@shared/utils/phone";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 10px;
  width: 100%;
  max-width: 480px;
  padding: 24px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Field = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const Input = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const FooterActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  padding: 9px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid
    ${({ $primary, theme }) =>
      $primary ? theme.colors.primary : theme.colors.border};
  background: ${({ $primary, theme }) =>
    $primary ? theme.colors.primary : "transparent"};
  color: ${({ $primary }) => ($primary ? "#fff" : "inherit")};
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  margin-top: 12px;
`;

interface Props {
  store: StoreRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StoreFormModal({ store, onClose, onSaved }: Props) {
  const isNew = store === null;
  const [name, setName] = useState(store?.name ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [phoneDigits, setPhoneDigits] = useState(phoneToDigits(store?.phone ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(store?.name ?? "");
    setAddress(store?.address ?? "");
    setPhoneDigits(phoneToDigits(store?.phone ?? ""));
  }, [store]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Store name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phoneDigits ? normalizeUzPhone(phoneDigits) : undefined,
      };
      if (isNew) {
        await stores.create(payload);
      } else {
        await stores.update(store.id, payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Modal>
        <ModalHeader>
          <ModalTitle>{isNew ? "New Store" : "Edit Store"}</ModalTitle>
          <CloseBtn onClick={onClose}>
            <X size={18} />
          </CloseBtn>
        </ModalHeader>

        <form onSubmit={handleSubmit}>
          <Field>
            <Label>Store name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downtown Grocery"
              autoFocus
            />
          </Field>
          <Field>
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main Street, Tashkent"
            />
          </Field>
          <Field>
            <UzbekPhoneInput
              label="Phone"
              valueDigits={phoneDigits}
              onDigitsChange={setPhoneDigits}
            />
          </Field>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <FooterActions>
            <Btn type="button" onClick={onClose}>
              Cancel
            </Btn>
            <Btn type="submit" $primary disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </Btn>
          </FooterActions>
        </form>
      </Modal>
    </Overlay>
  );
}
