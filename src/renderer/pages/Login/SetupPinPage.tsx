import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import { Delete, Eraser, ShieldCheck } from "lucide-react";

const Container = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
  align-items: center;
  justify-content: center;
`;

const Card = styled.div`
  width: 100%;
  max-width: 360px;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const IconWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.primary};
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  margin: 0 0 ${({ theme }) => theme.spacing.xl};
`;

const PinDisplay = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
`;

const PinDot = styled.div<{ $filled: boolean; $error?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid ${({ theme, $error }) => $error ? theme.colors.error : theme.colors.primary};
  background-color: ${({ theme, $filled, $error }) =>
    $filled ? ($error ? theme.colors.error : theme.colors.primary) : "transparent"};
  transition: all 0.2s ease;
`;

const DotsRow = styled.div<{ $shake?: boolean }>`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  animation: ${({ $shake }) => $shake ? shake : "none"} 0.4s ease;
`;

const PinPad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  max-width: 300px;
  margin: 0 auto;
`;

const PinButton = styled.button<{ $variant?: "clear" | "back" }>`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 22px;
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
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  min-height: 20px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const StepIndicator = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StepDot = styled.div<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  transition: background 0.2s;
`;

type Step = "enter" | "confirm";

export function SetupPinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("enter");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [shakeConfirm, setShakeConfirm] = useState(false);

  const current = step === "enter" ? pin : confirmPin;
  const setCurrent = step === "enter" ? setPin : setConfirmPin;

  const triggerShake = () => {
    setShakeConfirm(true);
    setTimeout(() => setShakeConfirm(false), 450);
  };

  const handleNumber = useCallback((num: string) => {
    if (current.length >= 4) return;
    setError("");
    const next = current + num;
    setCurrent(next);

    if (next.length === 4) {
      if (step === "enter") {
        setTimeout(() => setStep("confirm"), 200);
      } else {
        // Confirm step complete — validate
        if (next !== pin) {
          triggerShake();
          setTimeout(() => {
            setConfirmPin("");
            setError(t("auth.errors.pin_mismatch"));
          }, 420);
        } else {
          // Save PIN
          window.electronAPI.auth.setupPin(next).then(() => {
            navigate("/", { replace: true });
          }).catch(() => {
            setError(t("auth.errors.login_failed"));
            setConfirmPin("");
          });
        }
      }
    }
  }, [current, pin, step, setCurrent, navigate, t]);

  const handleBackspace = useCallback(() => {
    setError("");
    setCurrent((prev) => prev.slice(0, -1));
  }, [setCurrent]);

  const handleClear = useCallback(() => {
    setError("");
    if (step === "confirm") {
      setStep("enter");
      setPin("");
      setConfirmPin("");
    } else {
      setPin("");
    }
  }, [step]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleNumber(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNumber, handleBackspace, handleClear]);

  const isError = !!error && step === "confirm";

  return (
    <Container>
      <Card>
        <IconWrap>
          <ShieldCheck size={48} />
        </IconWrap>

        <Title>{t("auth.setupPin")}</Title>
        <Subtitle>
          {step === "enter" ? t("auth.setupPinSubtitle") : t("auth.confirmPinSubtitle")}
        </Subtitle>

        <StepIndicator>
          <StepDot $active={step === "enter"} />
          <StepDot $active={step === "confirm"} />
        </StepIndicator>

        <DotsRow $shake={shakeConfirm}>
          {[0, 1, 2, 3].map((i) => (
            <PinDot key={i} $filled={current.length > i} $error={isError} />
          ))}
        </DotsRow>

        <ErrorMsg>{error}</ErrorMsg>

        <PinPad>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <PinButton key={num} onClick={() => handleNumber(num)}>
              {num}
            </PinButton>
          ))}
          <PinButton $variant="clear" onClick={handleClear}>
            <Eraser size={28} />
          </PinButton>
          <PinButton onClick={() => handleNumber("0")}>0</PinButton>
          <PinButton onClick={handleBackspace}>
            <Delete size={28} />
          </PinButton>
        </PinPad>
      </Card>
    </Container>
  );
}
