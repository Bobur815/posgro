import React from "react";
import { useNavigate } from "react-router-dom";
import { useAdminLocked, useModeStore } from "../../store/mode-store";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  UserCog,
  Settings,
  Printer,
  Receipt,
  RefreshCw,
  Tag,
  Users,
  Package,
  Scale,
  Monitor,
  Download,
  ShieldCheck,
} from "lucide-react";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  padding-left: 25px;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const SettingsCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const CardIcon = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.primary};
`;

const CardTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.text};
`;

const CardDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // An OFFLINE_ONLY store has no server to sync with, so the sync page is a dead end: its button
  // reaches a sync service that returns early for such a store. Hiding the tile is what actually
  // removes it from the terminal — the toolbar buttons are gated the same way in AppBar/Sidebar.
  const offlineOnly = useModeStore((s) => s.mode) === "OFFLINE_ONLY";
  // A satellite's store settings, users and fiscal device are its main's (LAN plan §4); what
  // stays is this machine's own — its printer, scale, labels — and the person's own account.
  const isSatellite = useModeStore((s) => s.isSatellite);
  // Users are edited on the web for a cashier-only store and on the main for a satellite; the
  // route is ModeGuard-ed, so a tile here would only bounce back home.
  const adminLocked = useAdminLocked();

  const settingsSections = [
    {
      icon: <Users size={32} />,
      title: t("nav.users"),
      description: t("settings.usersDescription"),
      path: "/users",
      hidden: adminLocked,
    },
    {
      icon: <UserCog size={32} />,
      title: t("settings.userSettings"),
      description: t("settings.userSettingsDescription"),
      path: "/settings/user",
    },
    {
      icon: <Settings size={32} />,
      title: t("settings.systemSettings"),
      description: t("settings.systemSettingsDescription"),
      path: "/settings/system",
      hidden: isSatellite,
    },
    {
      icon: <Printer size={32} />,
      title: t("settings.printerSettings"),
      description: t("settings.printerSettingsDescription"),
      path: "/settings/printer",
    },
    {
      icon: <Receipt size={32} />,
      title: t("receipt.title"),
      description: t("receipt.description"),
      path: "/settings/receipt",
      hidden: isSatellite,
    },
    {
      icon: <RefreshCw size={32} />,
      title: t("settings.syncSettings"),
      description: t("settings.syncSettingsDescription"),
      path: "/settings/sync",
      // The page is the VPS sync's diagnostics. A satellite never talks to the VPS; the sync
      // button still refreshes its catalog from the main.
      hidden: offlineOnly || isSatellite,
    },
    {
      icon: <Tag size={32} />,
      title: t("priceTags.title"),
      description: t("priceTags.settingsDescription"),
      path: "/settings/price-tags",
    },
    {
      icon: <Scale size={32} />,
      title: t("scaleSettings.title"),
      description: t("scaleSettings.description"),
      path: "/settings/scale",
    },
    {
      icon: <Scale size={32} />,
      title: t("inventory.preWeighed"),
      description: t("bulkWeigh.preWeighedInventory"),
      path: "/settings/weighed",
    },
    {
      icon: <ShieldCheck size={32} />,
      title: t("fiscalSettings.title", "Фискализация (REGOS:VCR)"),
      description: t("fiscalSettings.description", "Фискальный модуль и виртуальная касса"),
      path: "/settings/fiscal",
      hidden: isSatellite,
    },
    {
      icon: <Monitor size={32} />,
      title: t("settings.terminalStatus"),
      description: t("settings.terminalStatusDescription"),
      path: "/settings/terminals",
      hidden: isSatellite,
    },
    {
      icon: <Download size={32} />,
      title: t("settings.appUpdate"),
      description: t("settings.appUpdateDescription"),
      path: "/settings/app-update",
    },
  ].filter((section) => !section.hidden);

  return (
    <Container>
      <Title>{t("settings.title")}</Title>

      <SettingsGrid>
        {settingsSections.map((section) => (
          <SettingsCard
            key={section.path}
            onClick={() => navigate(section.path)}
          >
            <CardIcon>{section.icon}</CardIcon>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </SettingsCard>
        ))}
      </SettingsGrid>
    </Container>
  );
}
