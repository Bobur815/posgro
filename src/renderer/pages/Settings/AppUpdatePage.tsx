import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import {
  ArrowLeft,
  Download,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "../../components/common/Button";

const Container = styled.div`
  max-width: 600px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding-left: 25px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const BackButton = styled(Button)``;

const Title = styled.h1`
  margin: 0;
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

const VersionBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  background-color: ${({ theme }) => theme.colors.primary}22;
  color: ${({ theme }) => theme.colors.primary};
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  transition: width 0.3s ease;
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SpinnerIcon = styled(RefreshCw)`
  animation: ${spin} 1s linear infinite;
`;

type UpdateState =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "cancelled"
  | "error";

export function AppUpdatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<UpdateState>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateVersion, setUpdateVersion] = useState("");
  const [progress, setProgress] = useState({ percent: 0, bytesPerSecond: 0 });
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    window.electronAPI.app
      .getVersion()
      .then(setCurrentVersion)
      .catch(() => {});

    const unsubs = [
      window.electronAPI.updater.onChecking(() => setState("checking")),
      window.electronAPI.updater.onAvailable((info) => {
        setUpdateVersion(info.version);
        setState("available");
      }),
      window.electronAPI.updater.onNotAvailable(() => setState("up-to-date")),
      window.electronAPI.updater.onProgress((p) => {
        setProgress({ percent: p.percent, bytesPerSecond: p.bytesPerSecond });
        setState("downloading");
      }),
      window.electronAPI.updater.onDownloaded((info) => {
        setUpdateVersion(info.version);
        setState("downloaded");
      }),
      window.electronAPI.updater.onError((e) => {
        setErrorMsg(e.message);
        setState("error");
      }),
      window.electronAPI.updater.onCancelled(() => setState("cancelled")),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  const handleCheck = () => {
    setState("checking");
    window.electronAPI.updater.checkForUpdates();
  };

  const handleDownload = () => {
    window.electronAPI.updater.startDownload();
  };

  const handleInstall = () => {
    window.electronAPI.updater.quitAndInstall();
  };

  const handleCancel = () => {
    window.electronAPI.updater.cancelDownload();
  };

  return (
    <Container>
      <Header>
        <BackButton
          variant="secondary"
          size="small"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft size={20} />
        </BackButton>
        <Title>{t("settings.appUpdate")}</Title>
      </Header>

      <Section>
        <SectionTitle>{t("updater.currentVersion")}</SectionTitle>
        {currentVersion && <VersionBadge>v{currentVersion}</VersionBadge>}

        {state === "idle" && (
          <Button onClick={handleCheck}>
            <Download size={16} />
            {t("updater.checkForUpdates")}
          </Button>
        )}

        {state === "checking" && (
          <StatusRow>
            <SpinnerIcon size={16} />
            {t("updater.checking")}
          </StatusRow>
        )}

        {state === "up-to-date" && (
          <>
            <StatusRow>
              <CheckCircle size={16} color="green" />
              {t("updater.upToDate")}
            </StatusRow>
            <Button variant="secondary" onClick={handleCheck}>
              {t("updater.checkForUpdates")}
            </Button>
          </>
        )}

        {state === "available" && (
          <>
            <StatusRow>
              <Download size={16} />
              {t("updater.updateAvailable")} — v{updateVersion}
            </StatusRow>
            <Button onClick={handleDownload}>
              {t("updater.downloadUpdate")} v{updateVersion}
            </Button>
          </>
        )}

        {state === "downloading" && (
          <>
            <StatusRow>
              <SpinnerIcon size={16} />
              {t("updater.downloading")} — {Math.round(progress.percent)}% (
              {Math.round(progress.bytesPerSecond / 1024)} KB/s)
            </StatusRow>
            <ProgressBar>
              <ProgressFill $percent={progress.percent} />
            </ProgressBar>
            <Button
              variant="secondary"
              onClick={handleCancel}
              style={{ marginTop: 8 }}
            >
              <XCircle size={16} />
              {t("updater.cancelDownload")}
            </Button>
          </>
        )}

        {state === "cancelled" && (
          <>
            <StatusRow>
              <XCircle size={16} />
              {t("updater.downloadCancelled")}
            </StatusRow>
            <Button onClick={handleDownload}>
              {t("updater.downloadUpdate")} v{updateVersion}
            </Button>
          </>
        )}

        {state === "downloaded" && (
          <>
            <StatusRow>
              <CheckCircle size={16} color="green" />
              {t("updater.downloaded")} — v{updateVersion}
            </StatusRow>
            <Button onClick={handleInstall}>
              {t("updater.installAndRestart")}
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <StatusRow>
              <AlertCircle size={16} color="red" />
              {t("updater.error")}: {errorMsg}
            </StatusRow>
            <Button variant="secondary" onClick={handleCheck}>
              {t("updater.retry")}
            </Button>
          </>
        )}
      </Section>
    </Container>
  );
}
