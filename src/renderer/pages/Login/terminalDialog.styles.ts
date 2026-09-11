import styled from "styled-components";

/**
 * The login screen's terminal dialogs: server address, web admin QR, subscription, and the role
 * panel. Shared so every dialog opened from the gear looks like one family, and so the role panel
 * does not grow a second copy of the same inputs and buttons.
 */

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

export const Dialog = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 420px;
`;

/* For dialogs that carry more than one field — the QR pay screen, and terminal settings. */
export const WideDialog = styled(Dialog)`
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
`;

export const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
`;

export const DialogTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

export const TextInput = styled.input`
  width: 100%;
  padding: 11px 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

export const Hint = styled.p`
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 8px 0 0;
`;

export const ErrorText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  margin: 10px 0 0;
`;

export const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

export const ActionButton = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid
    ${({ $primary, $danger, theme }) =>
      $danger ? theme.colors.error : $primary ? theme.colors.primary : theme.colors.border};
  background: ${({ $primary, $danger, theme }) =>
    $danger ? theme.colors.error : $primary ? theme.colors.primary : "transparent"};
  color: ${({ $primary, $danger, theme }) => ($primary || $danger ? "#fff" : theme.colors.text)};

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

/* ── Role panel ──────────────────────────────────────────────────────────────────────────────── */

export const Section = styled.section`
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

export const SectionTitle = styled.h4`
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

export const RoleLine = styled.p`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

export const Field = styled.div`
  margin-top: 12px;
`;

export const ListRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

/* Left-aligned explicitly: the login card centres its text, and a short id ("T3") would drift. */
export const ListMain = styled.div`
  min-width: 0;
  text-align: left;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};

  small {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

export const SmallButton = styled(ActionButton)`
  padding: 6px 12px;
  font-size: 13px;
  flex-shrink: 0;
`;

/* A secondary action that should not compete with the primary ones — "make this a satellite…". */
export const TextButton = styled.button<{ $danger?: boolean }>`
  display: block;
  margin-top: 14px;
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  color: ${({ $danger, theme }) => ($danger ? theme.colors.error : theme.colors.primary)};
`;

export const Notice = styled.div<{ $danger?: boolean }>`
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ $danger, theme }) => ($danger ? theme.colors.error : theme.colors.warning)};
  background: ${({ $danger, theme }) => ($danger ? theme.colors.error : theme.colors.warning)}1a;
`;

/* The pairing code has to be read across a counter, so it is large and spaced like a PIN. */
export const CodeDisplay = styled.div`
  margin-top: 10px;
  font-family: "Consolas", "Courier New", monospace;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 10px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
`;

export const AddressText = styled.p`
  margin: 6px 0 0;
  font-size: 14px;
  text-align: center;
  word-break: break-all;
  color: ${({ theme }) => theme.colors.text};
`;

export const CheckboxRow = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  input {
    margin-top: 2px;
  }
`;
