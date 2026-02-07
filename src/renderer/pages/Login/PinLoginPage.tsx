import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAuthStore } from "../../store/auth-store";
import { Delete, Eraser } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { UzbekPhoneInput } from "@renderer/components/common/UzbekPhoneInput";
import { isUzPhoneComplete } from "@shared/utils/phone";

type LoginMode = "pin" | "phone";

const Container = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
`;

const LeftPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl};
  background-color: ${({ theme }) => theme.colors.surface};
`;

const RightPanel = styled.div`
  flex: 1;
  background-image: url("./images/Grocery-Sub-Banner_2_mic.webp");
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 768px) {
    display: none;
  }
`;

const LoginCard = styled.div`
  width: 100%;
  max-width: 400px;
  text-align: center;
`;

const Logo = styled.h1`
  font-size: 32px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const PinDisplay = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const PinDot = styled.div<{ $filled: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.primary};
  background-color: ${({ theme, $filled }) =>
    $filled ? theme.colors.primary : "transparent"};
  transition: all 0.2s ease;
`;

const PinPad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  max-width: 300px;
  margin: 0 auto;
`;

const PinButton = styled.button<{ $variant?: "clear" | "back" }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 28px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary}15;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:active {
    transform: scale(0.95);
    background-color: ${({ theme }) => theme.colors.primary}30;
  }

  ${({ $variant, theme }) =>
    $variant === "clear" &&
    `
    font-size: 14px;
    color: ${theme.colors.error};
    border-color: ${theme.colors.error}50;
    &:hover {
      background-color: ${theme.colors.error}15;
      border-color: ${theme.colors.error};
    }
  `}

  ${({ $variant, theme }) =>
    $variant === "back" &&
    `
    font-size: 20px;
    &:hover {
      background-color: ${theme.colors.warning}15;
      border-color: ${theme.colors.warning};
    }
  `}
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error};
  margin-top: ${({ theme }) => theme.spacing.md};
  font-size: 14px;
  min-height: 20px;
`;

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: ${({ theme }) => theme.colors.surface}cc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.primary};
  z-index: 100;
`;

const SwitchLink = styled.button`
  margin-top: ${({ theme }) => theme.spacing.xl};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  font-size: 14px;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
`;

const KeyboardHint = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ContentWrapper = styled.div`
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const PhoneForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  text-align: left;
`;

export function PinLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginWithPin, login, isLoading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<LoginMode>("pin");
  const [pin, setPin] = useState("");

  // Phone login state
  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const switchMode = (newMode: LoginMode) => {
    setPin("");
    setPhoneDigits("");
    setPassword("");
    clearError();
    setMode(newMode);
  };

  // --- PIN logic ---
  const handlePinSubmit = useCallback(
    async (pinValue: string) => {
      if (pinValue.length !== 4) return;

      const success = await loginWithPin(pinValue);
      if (success) {
        navigate("/");
      } else {
        setPin("");
      }
    },
    [loginWithPin, navigate],
  );

  useEffect(() => {
    if (pin.length === 4) {
      handlePinSubmit(pin);
    }
  }, [pin, handlePinSubmit]);

  useEffect(() => {
    if (mode !== "pin") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (pin.length < 4) {
          setPin((prev) => prev + e.key);
          clearError();
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
        clearError();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPin("");
        clearError();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin, isLoading, clearError, mode]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4 && !isLoading) {
      setPin((prev) => prev + num);
      clearError();
    }
  };

  const handleBackspace = () => {
    if (!isLoading) {
      setPin((prev) => prev.slice(0, -1));
      clearError();
    }
  };

  const handleClear = () => {
    if (!isLoading) {
      setPin("");
      clearError();
    }
  };

  // --- Phone login logic ---
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUzPhoneComplete(phoneDigits)) return;

    const fullPhone = "998" + phoneDigits;
    const success = await login(fullPhone, password);
    if (success) {
      navigate("/");
    }
  };

  const handlePhoneEnter = () => {
    passwordRef.current?.focus();
  };

  return (
    <Container>
      <LeftPanel>
        <LoginCard>
          <Logo>Grocery POS</Logo>

          {mode === "pin" ? (
            <ContentWrapper key="pin">
              <Subtitle>{t("auth.enterPin")}</Subtitle>

              <PinDisplay>
                {[0, 1, 2, 3].map((i) => (
                  <PinDot key={i} $filled={pin.length > i} />
                ))}
              </PinDisplay>

              <PinPad>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <PinButton
                    key={num}
                    onClick={() => handleNumberClick(num)}
                    disabled={isLoading}
                    tabIndex={-1}
                  >
                    {num}
                  </PinButton>
                ))}
                <PinButton
                  $variant="clear"
                  onClick={handleClear}
                  disabled={isLoading}
                  tabIndex={-1}
                >
                  <Eraser size={30} />
                </PinButton>
                <PinButton
                  onClick={() => handleNumberClick("0")}
                  disabled={isLoading}
                  tabIndex={-1}
                >
                  0
                </PinButton>
                <PinButton
                  $variant="back"
                  onClick={handleBackspace}
                  disabled={isLoading}
                  tabIndex={-1}
                >
                  <Delete size={30} />
                </PinButton>
              </PinPad>

              <ErrorMessage>{error || ""}</ErrorMessage>

              <KeyboardHint>{t("auth.keyboardHint")}</KeyboardHint>

              <SwitchLink onClick={() => switchMode("phone")}>
                {t("auth.usePhoneLogin")}
              </SwitchLink>
            </ContentWrapper>
          ) : (
            <ContentWrapper key="phone">
              <Subtitle>{t("auth.login")}</Subtitle>

              <PhoneForm onSubmit={handlePhoneSubmit}>
                <UzbekPhoneInput
                  label={t("auth.phone")}
                  valueDigits={phoneDigits}
                  onDigitsChange={setPhoneDigits}
                  onEnter={handlePhoneEnter}
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
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button
                  type="submit"
                  disabled={isLoading || !isUzPhoneComplete(phoneDigits)}
                  fullWidth
                >
                  {isLoading ? t("common.loading") : t("auth.login")}
                </Button>
              </PhoneForm>

              <SwitchLink onClick={() => switchMode("pin")}>
                ← {t("auth.enterPin")}
              </SwitchLink>
            </ContentWrapper>
          )}
        </LoginCard>
      </LeftPanel>

      <RightPanel />

      {isLoading && <LoadingOverlay>{t("common.loading")}...</LoadingOverlay>}
    </Container>
  );
}
