import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Check, ChevronDown, LogOut, Moon, Newspaper, RefreshCw, Sun } from "lucide-react";
import { useTheme } from "@theme/ThemeProvider";
import { ConfirmDialog } from "@components/common/ConfirmDialog";
import { useToast } from "@context/ToastContext";
import { useAuthStore } from "../../store/auth-store";
import { useSettingsStore } from "../../store/settings-store";

/**
 * The bar above every page: which store you are in (and a switch to your others), then news,
 * language and your profile — sign out and the theme live in the profile menu.
 *
 * One person with several stores has one account in each; the switcher lists the ones their
 * password opened at login, and switching reloads the page so no store's data outlives it.
 */

const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 60px;
  padding: 6px 16px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 767px) {
    padding: 6px 10px;
  }
`;

const Side = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const StoreBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StoreLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};

  @media (max-width: 767px) {
    display: none;
  }
`;

const Anchor = styled.div`
  position: relative;
`;

const StoreButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  max-width: 280px;
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  @media (max-width: 767px) {
    min-width: 0;
    max-width: 170px;
  }
`;

const StoreName = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.success ?? "#16a34a"};
`;

const RoundButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ProfileButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 4px;
  border: none;
  border-radius: 24px;
  background: none;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`;

const Avatar = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.textSecondary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
`;

const ProfileName = styled.span`
  font-weight: 600;
  font-size: 14px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 767px) {
    display: none;
  }
`;

const Menu = styled.div<{ $align: "left" | "right" }>`
  position: absolute;
  top: calc(100% + 6px);
  ${({ $align }) => ($align === "right" ? "right: 0;" : "left: 0;")}
  z-index: 100;
  min-width: 220px;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows?.md ?? "0 8px 24px rgba(0, 0, 0, 0.12)"};
`;

const MenuHeader = styled.div`
  padding: 8px 10px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 4px;

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.text};
    font-size: 14px;
  }

  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.text)};
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`;

const MenuSpacer = styled.span`
  flex: 1;
`;

/** A menu anchored to its button: closes on a click outside it, and on Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

const LANGUAGES = [
  { code: "ru", short: "RU", label: "Русский" },
  { code: "uz", short: "UZ", label: "O'zbekcha" },
];

export function TopBar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { mode, toggleTheme } = useTheme();
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const { user, stores, loadStores, switchStore, logout } = useAuthStore();

  const storeMenu = usePopover();
  const langMenu = usePopover();
  const profileMenu = usePopover();
  const [switching, setSwitching] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // The list as it is now — a store deactivated since login drops out of it.
  useEffect(() => {
    if (user?.storeId) void loadStores();
  }, [user?.storeId, loadStores]);

  if (!user) return null;

  const name = i18n.language === "uz" ? user.nameUz : user.nameRu;
  const roleLabel =
    user.role === "SUPER_ADMIN"
      ? "Super Admin"
      : user.role === "ADMIN"
        ? t("users.admin")
        : t("users.cashier");
  const current = stores.find((s) => s.id === user.storeId);
  const canSwitch = stores.length > 1 && !switching;
  const language = LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) ?? LANGUAGES[0];

  const pickStore = async (storeId: string) => {
    storeMenu.setOpen(false);
    if (storeId === user.storeId) return;
    setSwitching(true);
    try {
      await switchStore(storeId); // reloads the page
    } catch {
      toast.error(t("topBar.switchFailed"));
      setSwitching(false);
    }
  };

  const pickLanguage = (code: string) => {
    langMenu.setOpen(false);
    setLanguage(code);
    void i18n.changeLanguage(code);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <Bar>
      <Side>
        {user.storeId && (
          <StoreBlock>
            <StoreLabel>{t("topBar.organizations")}</StoreLabel>
            <Anchor ref={storeMenu.ref}>
              <StoreButton
                type="button"
                disabled={!canSwitch}
                onClick={() => storeMenu.setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={storeMenu.open}
              >
                <Dot />
                <StoreName>{current?.name ?? "…"}</StoreName>
                {stores.length > 1 && <ChevronDown size={16} />}
              </StoreButton>
              {storeMenu.open && (
                <Menu $align="left" role="menu">
                  {stores.map((store) => (
                    <MenuItem key={store.id} type="button" onClick={() => pickStore(store.id)}>
                      <Dot />
                      <span>{store.name}</span>
                      <MenuSpacer />
                      {store.id === user.storeId && <Check size={16} />}
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </Anchor>
          </StoreBlock>
        )}
        <RoundButton
          type="button"
          title={t("topBar.refresh")}
          aria-label={t("topBar.refresh")}
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={17} />
        </RoundButton>
      </Side>

      <Side>
        {/* News is published from the super-admin dashboard — not built yet. */}
        <RoundButton
          type="button"
          disabled
          title={`${t("topBar.news")} — ${t("topBar.comingSoon")}`}
          aria-label={t("topBar.news")}
        >
          <Newspaper size={17} />
        </RoundButton>

        <Anchor ref={langMenu.ref}>
          <RoundButton
            type="button"
            title={t("topBar.language")}
            aria-label={t("topBar.language")}
            aria-haspopup="menu"
            aria-expanded={langMenu.open}
            onClick={() => langMenu.setOpen((o) => !o)}
          >
            {language.short}
          </RoundButton>
          {langMenu.open && (
            <Menu $align="right" role="menu">
              {LANGUAGES.map((l) => (
                <MenuItem key={l.code} type="button" onClick={() => pickLanguage(l.code)}>
                  <span>{l.label}</span>
                  <MenuSpacer />
                  {l.code === language.code && <Check size={16} />}
                </MenuItem>
              ))}
            </Menu>
          )}
        </Anchor>

        <Anchor ref={profileMenu.ref}>
          <ProfileButton
            type="button"
            aria-label={t("topBar.profile")}
            aria-haspopup="menu"
            aria-expanded={profileMenu.open}
            onClick={() => profileMenu.setOpen((o) => !o)}
          >
            <Avatar>{initials(name)}</Avatar>
            <ProfileName>{name}</ProfileName>
          </ProfileButton>
          {profileMenu.open && (
            <Menu $align="right" role="menu">
              <MenuHeader>
                <strong>{name}</strong>
                <span>{roleLabel}</span>
              </MenuHeader>
              <MenuItem type="button" onClick={toggleTheme}>
                {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                <span>{t("topBar.theme")}</span>
                <MenuSpacer />
                <span>{mode === "dark" ? t("settings.darkTheme") : t("settings.lightTheme")}</span>
              </MenuItem>
              <MenuItem
                type="button"
                $danger
                onClick={() => {
                  profileMenu.setOpen(false);
                  setConfirmLogout(true);
                }}
              >
                <LogOut size={16} />
                <span>{t("auth.logout")}</span>
              </MenuItem>
            </Menu>
          )}
        </Anchor>
      </Side>

      {confirmLogout && (
        <ConfirmDialog
          title={t("auth.logout")}
          message={t("auth.logoutConfirm")}
          confirmLabel={t("auth.logout")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </Bar>
  );
}
