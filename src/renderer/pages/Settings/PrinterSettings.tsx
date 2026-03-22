import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Button } from "../../components/common/Button";
import { useToast } from "../../context/ToastContext";
import { ArrowLeft, RefreshCcw, Printer, Check } from "lucide-react";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  max-width: 700px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BackButton = styled(Button)``;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Card = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const CardTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PrinterList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PrinterItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  border: 2px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary + "10" : theme.colors.background};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const PrinterName = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const SelectedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

export function PrinterSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  const loadPrinters = async () => {
    setIsLoading(true);
    try {
      const [available, saved] = await Promise.all([
        window.electronAPI.printer.getAvailablePrinters(),
        window.electronAPI.settings.get("printer_name"),
      ]);
      setPrinters(available || []);
      setSelectedPrinter(saved || "");
    } catch (err) {
      console.error("Failed to load printers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const handleSelect = async (name: string) => {
    try {
      await window.electronAPI.settings.set("printer_name", name);
      setSelectedPrinter(name);
      toast.success(t("printer.saved"));
    } catch (err) {
      toast.error(t("common.error"));
    }
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    try {
      await window.electronAPI.printer.testPrint();
      toast.success(t("printer.testSent"));
    } catch (err) {
      toast.error(t("printer.testFailed"));
    } finally {
      setIsTesting(false);
    }
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
        <Title>{t("settings.printerSettings")}</Title>
      </Header>

      <Card>
        <CardTitle>
          <Printer size={20} />
          {t("printer.availablePrinters")}
          <Button
            variant="secondary"
            size="small"
            onClick={loadPrinters}
            disabled={isLoading}
            style={{ marginLeft: "auto" }}
          >
            <RefreshCcw size={16} />
          </Button>
        </CardTitle>

        {isLoading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : printers.length === 0 ? (
          <EmptyState>{t("printer.noPrintersFound")}</EmptyState>
        ) : (
          <PrinterList>
            {printers.map((name) => (
              <PrinterItem
                key={name}
                $selected={name === selectedPrinter}
                onClick={() => handleSelect(name)}
              >
                <PrinterName>
                  <Printer size={18} />
                  {name}
                </PrinterName>
                {name === selectedPrinter && (
                  <SelectedBadge>
                    <Check size={14} />
                    {t("printer.selected")}
                  </SelectedBadge>
                )}
              </PrinterItem>
            ))}
          </PrinterList>
        )}
      </Card>

      <Actions>
        <Button
          onClick={handleTestPrint}
          disabled={isTesting || !selectedPrinter}
        >
          <Printer size={18} />
          {isTesting ? t("printer.testing") : t("printer.testPrint")}
        </Button>
      </Actions>
    </Container>
  );
}
