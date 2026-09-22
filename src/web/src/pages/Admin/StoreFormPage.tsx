import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useNavigate, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { stores, StoreRecord, StoreMode } from "../../api/client";
import { StoreBreadcrumb } from "./StoreBreadcrumb";
import { UzbekPhoneInput } from "@components/common/UzbekPhoneInput";
import { phoneToDigits, normalizeUzPhone } from "@shared/utils/phone";

const Page = styled.div`
  padding: 32px;
  max-width: 720px;

  @media (max-width: 600px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  margin-bottom: 24px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 24px;

  @media (max-width: 600px) {
    padding: 16px;
  }
`;

const Loading = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  color: ${({ theme }) => theme.colors.textSecondary};
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

const Select = styled.select`
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

const CheckRow = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 6px;
  line-height: 1.4;
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

/**
 * Create a store (/admin/stores/new) or edit one (/admin/stores/:id/edit). Loads the store by the
 * id in the URL, so a reload or a shared link opens the same form.
 */
export function StoreFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoadError(null);
    stores
      .getById(id)
      .then(setStore)
      .catch((e: Error) => setLoadError(e.message));
  }, [id]);

  if (!id) {
    return (
      <StoreForm
        store={null}
        onDone={(saved) => navigate(`/admin/stores/${saved.id}`)}
        onCancel={() => navigate("/admin/stores")}
      />
    );
  }

  return store ? (
    <StoreForm
      store={store}
      onDone={() => navigate(`/admin/stores/${id}`)}
      onCancel={() => navigate(`/admin/stores/${id}`)}
    />
  ) : (
    <Page>
      <Header>
        <StoreBreadcrumb items={[{ label: "…" }, { label: "Edit" }]} />
      </Header>
      {loadError ? (
        <ErrorMsg>{loadError}</ErrorMsg>
      ) : (
        <Loading>
          <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          Loading…
        </Loading>
      )}
    </Page>
  );
}

interface FormProps {
  store: StoreRecord | null;
  onDone: (saved: StoreRecord) => void;
  onCancel: () => void;
}

function StoreForm({ store, onDone, onCancel }: FormProps) {
  const isNew = store === null;
  const [name, setName] = useState(store?.name ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [phoneDigits, setPhoneDigits] = useState(phoneToDigits(store?.phone ?? ""));
  const [mode, setMode] = useState<StoreMode>(store?.mode ?? "ONLINE");
  const [posAdminLocked, setPosAdminLocked] = useState(store?.posAdminLocked ?? false);
  // Always starts blank — the server never returns the password, only whether one exists. Blank
  // therefore means "leave as-is", which is why clearing needs its own explicit control.
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [clearSuperAdminPassword, setClearSuperAdminPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An OFFLINE_ONLY store keeps full local CRUD by definition, so the lock has no meaning there.
  const lockApplies = mode === "ONLINE";

  useEffect(() => {
    setName(store?.name ?? "");
    setAddress(store?.address ?? "");
    setPhoneDigits(phoneToDigits(store?.phone ?? ""));
    setMode(store?.mode ?? "ONLINE");
    setPosAdminLocked(store?.posAdminLocked ?? false);
    setSuperAdminPassword("");
    setClearSuperAdminPassword(false);
  }, [store]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Store name is required.");
      return;
    }
    if (superAdminPassword && superAdminPassword.length < 4) {
      setError("The manager password must be at least 4 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phoneDigits ? normalizeUzPhone(phoneDigits) : undefined,
        mode,
        // Never persist a lock on an offline store — it would be a no-op the terminal still reads.
        posAdminLocked: lockApplies ? posAdminLocked : false,
        // Three states, matching what the API expects: omitted leaves the current password alone,
        // "" clears it, a value replaces it.
        ...(clearSuperAdminPassword
          ? { superAdminPassword: "" }
          : superAdminPassword
            ? { superAdminPassword }
            : {}),
      };
      const saved = isNew ? await stores.create(payload) : await stores.update(store.id, payload);
      onDone(saved);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <Header>
        <StoreBreadcrumb
          items={
            isNew
              ? [{ label: "Create" }]
              : [{ label: store.name, to: `/admin/stores/${store.id}` }, { label: "Edit" }]
          }
        />
      </Header>

      <Card>
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
            <Hint>
              The store admin's phone. One already admin of another store keeps its password here,
              so the owner's one sign-in opens both stores; a new phone starts with 123456.
            </Hint>
          </Field>

          <Field>
            <Label>Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as StoreMode)}>
              <option value="ONLINE">Online — server is the source of truth</option>
              <option value="OFFLINE_ONLY">Offline only — terminal is the source of truth, no sync</option>
            </Select>
            <Hint>
              {mode === "ONLINE"
                ? "The terminal syncs to this server and pulls product, user and supplier data down from it."
                : "The terminal never syncs. All admin work stays on the terminal itself."}
            </Hint>
          </Field>

          <Field>
            <CheckRow $disabled={!lockApplies}>
              <input
                type="checkbox"
                checked={lockApplies && posAdminLocked}
                disabled={!lockApplies}
                onChange={(e) => setPosAdminLocked(e.target.checked)}
              />
              <span>Cashier-only POS</span>
            </CheckRow>
            <Hint>
              {lockApplies
                ? "Hides stock, suppliers and user management in the Electron app and stops it uploading product, user, supplier, arrival and settings changes. Sales and shifts still sync. Takes effect on the terminal within one sync cycle; unchecking it restores everything."
                : "Only applies to online stores — an offline store always keeps full local management."}
            </Hint>
          </Field>

          <Field>
            <Label>Manager password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={superAdminPassword}
              disabled={clearSuperAdminPassword}
              placeholder={
                store?.hasSuperAdminPassword ? "Set — type to replace" : "Not set"
              }
              onChange={(e) => setSuperAdminPassword(e.target.value)}
            />
            <Hint>
              Asked for on the terminal before sensitive actions, such as deleting a receipt. The
              terminal checks it offline, so it works for an offline-only store too. Leave blank to
              keep the current password; leave it unset and nothing is gated.
            </Hint>
            {store?.hasSuperAdminPassword && (
              <CheckRow>
                <input
                  type="checkbox"
                  checked={clearSuperAdminPassword}
                  onChange={(e) => {
                    setClearSuperAdminPassword(e.target.checked);
                    if (e.target.checked) setSuperAdminPassword("");
                  }}
                />
                <span>Remove the password (stops gating anything)</span>
              </CheckRow>
            )}
          </Field>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <FooterActions>
            <Btn type="button" onClick={onCancel}>
              Cancel
            </Btn>
            <Btn type="submit" $primary disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </Btn>
          </FooterActions>
        </form>
      </Card>
    </Page>
  );
}
