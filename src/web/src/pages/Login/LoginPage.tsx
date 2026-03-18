import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAuthStore } from "../../store/auth-store";
import { useSettingsStore } from "../../store/settings-store";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { UzbekPhoneInput } from "@components/common/UzbekPhoneInput";
import { isUzPhoneComplete } from "@shared/utils/phone";

const Container = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 420px;
`;

const Logo = styled.h1`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  text-align: center;
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }) => theme.spacing.xl};
  font-size: 16px;
  text-align: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  min-height: 20px;
`;

const LangRow = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const LangButton = styled.button<{ $active?: boolean }>`
  background: none;
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  color: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const ENV_STORE_ID = import.meta.env.VITE_STORE_ID as string | undefined;

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const { language, setLanguage } = useSettingsStore();

  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState(
    ENV_STORE_ID ?? localStorage.getItem("last_store_id") ?? ""
  );
  const [showStoreId, setShowStoreId] = useState(!ENV_STORE_ID && !localStorage.getItem("last_store_id"));
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUzPhoneComplete(phoneDigits)) return;

    const fullPhone = "998" + phoneDigits;
    const success = await login(fullPhone, password, storeId || undefined);
    if (success) {
      if (storeId) localStorage.setItem("last_store_id", storeId);
      navigate("/");
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  return (
    <Container>
      <Card>
        <Logo>Yangi Asr</Logo>
        <Subtitle>{t("auth.login")}</Subtitle>

        <Form onSubmit={handleSubmit}>
          <UzbekPhoneInput
            label={t("auth.phone")}
            valueDigits={phoneDigits}
            onDigitsChange={setPhoneDigits}
            onEnter={() => passwordRef.current?.focus()}
          />

          <Input
            label={t("auth.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            ref={passwordRef}
            required
          />

          {!ENV_STORE_ID && (
            <>
              {!showStoreId ? (
                <button
                  type="button"
                  onClick={() => setShowStoreId(true)}
                  style={{ background: "none", border: "none", color: "inherit", opacity: 0.5, fontSize: 13, cursor: "pointer", textAlign: "left", padding: 0 }}
                >
                  {storeId ? `Store: ${storeId}` : "+ Enter store ID"}
                </button>
              ) : (
                <Input
                  label="Store ID"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  placeholder="e.g. default-store (leave empty for super admin)"
                />
              )}
            </>
          )}

          {error && (
            <ErrorMessage>{t(error, { defaultValue: error })}</ErrorMessage>
          )}

          <Button
            type="submit"
            disabled={isLoading || !isUzPhoneComplete(phoneDigits)}
            fullWidth
          >
            {isLoading ? t("common.loading") : t("auth.login")}
          </Button>
        </Form>

        <LangRow>
          <LangButton
            type="button"
            $active={language === "ru"}
            onClick={() => handleLanguageChange("ru")}
          >
            Русский
          </LangButton>
          <LangButton
            type="button"
            $active={language === "uz"}
            onClick={() => handleLanguageChange("uz")}
          >
            O'zbekcha
          </LangButton>
        </LangRow>
      </Card>
    </Container>
  );
}
