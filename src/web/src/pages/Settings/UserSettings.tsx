import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { auth as authApi } from "../../api/client";
import { TopBar } from "./DevicesPage";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Container = styled.div`
  max-width: 600px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Section = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FeedbackText = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: 14px;
  color: ${({ theme, $error }) =>
    $error ? theme.colors.error : theme.colors.success};
`;

export function UserSettings() {
  // Language, theme and signing out live in the top bar now (TopBar.tsx), on every screen size.
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setFeedback({ message: t("settings.passwordMismatch"), error: true });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setFeedback({ message: t("settings.passwordTooShort"), error: true });
      return;
    }

    try {
      await authApi.changePassword(
        passwordData.currentPassword,
        passwordData.newPassword,
      );
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setFeedback({ message: t("settings.passwordChanged"), error: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invalid_password")) {
        setFeedback({ message: t("settings.passwordWrong"), error: true });
      } else {
        setFeedback({
          message: t("settings.passwordChangeFailed"),
          error: true,
        });
      }
    }
  };

  return (
    <Container>
      <TopBar>
        <Button
          variant="secondary"
          size="small"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft size={20} />
        </Button>
        <Title>{t("settings.userSettings")}</Title>
      </TopBar>
      <Section>
        <SectionTitle>{t("settings.changePassword")}</SectionTitle>

        <Form onSubmit={handlePasswordSubmit}>
          <Input
            type="password"
            label={t("settings.currentPassword")}
            value={passwordData.currentPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({
                ...prev,
                currentPassword: e.target.value,
              }))
            }
            required
          />

          <Input
            type="password"
            label={t("settings.newPassword")}
            value={passwordData.newPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({
                ...prev,
                newPassword: e.target.value,
              }))
            }
            required
          />

          <Input
            type="password"
            label={t("settings.confirmPassword")}
            value={passwordData.confirmPassword}
            onChange={(e) =>
              setPasswordData((prev) => ({
                ...prev,
                confirmPassword: e.target.value,
              }))
            }
            required
          />

          {feedback && (
            <FeedbackText $error={feedback.error}>
              {feedback.message}
            </FeedbackText>
          )}

          <Button type="submit">{t("settings.updatePassword")}</Button>
        </Form>
      </Section>
    </Container>
  );
}
