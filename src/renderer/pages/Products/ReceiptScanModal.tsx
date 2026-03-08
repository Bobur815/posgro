import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  FileText,
  PlusCircle,
} from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { ProductForm } from "./ProductForm";
import {
  Supplier,
  SupplierPaymentMethod,
  ScannedReceiptData,
  ProductMatch,
  Product,
} from "@shared/types";

type Step = "upload" | "scanning" | "matching" | "review" | "creating" | "done";

interface ReceiptScanModalProps {
  suppliers: Supplier[];
  products: Product[];
  userId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const StepIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DropZone = styled.div<{ $isDragging?: boolean }>`
  border: 2px dashed
    ${({ theme, $isDragging }) =>
      $isDragging ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background-color: ${({ theme, $isDragging }) =>
    $isDragging ? theme.colors.primary + "10" : "transparent"};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.primary}10;
  }
`;

const DropZoneText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
  font-size: 14px;
`;

const PreviewImage = styled.img`
  max-width: 100%;
  max-height: 300px;
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const PdfPreview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.textSecondary};

  span {
    font-size: 13px;
    font-weight: 500;
    word-break: break-all;
    text-align: center;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const SpinnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  svg {
    animation: spin 1s linear infinite;
  }
`;

const SpinnerText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin: 0;
`;

const ReviewTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
`;

const ConfidenceBadge = styled.span<{ $level: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background-color: ${({ $level, theme }) =>
    $level === "exact"
      ? theme.colors.primary + "20"
      : $level === "high"
        ? theme.colors.success + "20"
        : $level === "medium"
          ? theme.colors.warning + "20"
          : $level === "low"
            ? theme.colors.warning + "40"
            : theme.colors.error + "20"};
  color: ${({ $level, theme }) =>
    $level === "exact"
      ? theme.colors.primary
      : $level === "high"
        ? theme.colors.success
        : $level === "medium"
          ? theme.colors.warning
          : $level === "low"
            ? theme.colors.warning
            : theme.colors.error};
`;

const ProductSelect = styled.select`
  width: 100%;
  padding: 4px 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;

const NumberInput = styled.input`
  width: 80px;
  padding: 4px 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  text-align: right;
`;

const SupplierRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const FormGroup = styled.div`
  flex: 1;
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const FullSelect = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: ${({ theme }) => theme.colors.primary};
  transition: width 0.3s;
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  text-align: center;
`;

const SuccessContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.success};
`;

const SkipCheckbox = styled.input`
  cursor: pointer;
`;

const PAYMENT_METHODS: SupplierPaymentMethod[] = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "INSTALLMENT",
  "ONE_TO_ONE",
];

interface ReviewItem {
  scannedName: string;
  mxik: string | null;
  productId: string;
  quantity: number;
  unitCost: number;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  skip: boolean;
}

export function ReceiptScanModal({
  suppliers,
  products,
  userId,
  onClose,
  onSuccess,
}: ReceiptScanModalProps) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanResult, setScanResult] = useState<ScannedReceiptData | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPaymentMethod>("CASH");

  // Local product list — starts from prop, updated after new product creation
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  // Index of the review row for which we're creating a new product
  const [addingForRowIdx, setAddingForRowIdx] = useState<number | null>(null);

  const [createProgress, setCreateProgress] = useState(0);
  const [createTotal, setCreateTotal] = useState(0);

  const handleProductCreated = async () => {
    // Reload the full product list from IPC
    const updated = (await window.electronAPI.products.getAll()) as Product[];
    setLocalProducts(updated);

    // Try to auto-assign the newly created product to the row
    if (addingForRowIdx !== null) {
      const row = reviewItems[addingForRowIdx];

      // Match by MXIK first, then by name
      let matched: Product | undefined;
      if (row.mxik) {
        matched = updated.find((p) => p.mxik === row.mxik);
      }
      if (!matched) {
        const nameLower = row.scannedName.toLowerCase();
        matched = updated.find(
          (p) =>
            p.nameRu.toLowerCase().includes(nameLower) ||
            p.nameUz.toLowerCase().includes(nameLower) ||
            nameLower.includes(p.nameRu.toLowerCase()) ||
            nameLower.includes(p.nameUz.toLowerCase()),
        );
      }

      if (matched) {
        updateReviewItem(addingForRowIdx, {
          productId: String(matched.id),
          confidence: "high",
        });
      }
    }

    setAddingForRowIdx(null);
  };

  const getProductName = (p: Product) =>
    i18n.language === "uz" ? p.nameUz : p.nameRu;

  const getConfidenceLabel = (c: string) => {
    const map: Record<string, string> = {
      exact: t("receiptScan.confidenceExact"),
      high: t("receiptScan.confidenceHigh"),
      medium: t("receiptScan.confidenceMedium"),
      low: t("receiptScan.confidenceLow"),
      none: t("receiptScan.confidenceNone"),
    };
    return map[c] || c;
  };

  const getPaymentMethodLabel = (method: SupplierPaymentMethod) => {
    const labels: Record<SupplierPaymentMethod, string> = {
      CASH: t("suppliers.cash"),
      CARD: t("suppliers.card"),
      BANK_TRANSFER: t("suppliers.bankTransfer"),
      INSTALLMENT: t("suppliers.installment"),
      ONE_TO_ONE: t("suppliers.oneToOne"),
    };
    return labels[method];
  };

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(t("receiptScan.invalidFileType"));
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(t("receiptScan.fileTooLarge"));
        return;
      }

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setImageBase64(base64);
        setImageMimeType(file.type);
        if (file.type === "application/pdf") {
          setImagePreview(null); // PDFs can't be shown as <img>
        } else {
          setImagePreview(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    },
    [t],
  );

  // Handle paste event for Ctrl+V
  useEffect(() => {
    if (step !== "upload") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) processFile(file);
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [step, processFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleScan = async () => {
    if (!imageBase64) return;

    setStep("scanning");
    setError(null);

    try {
      const result = (await window.electronAPI.receipt.scan(
        imageBase64,
        imageMimeType,
      )) as ScannedReceiptData;

      if (!result.items || result.items.length === 0) {
        setError(t("receiptScan.noItemsDetected"));
        setStep("upload");
        return;
      }

      setScanResult(result);
      setStep("matching");

      // Auto-match products — pass MXIK for highest-accuracy matching
      const matchItems = result.items.map((item) => ({
        name: item.scannedName,
        mxik: item.mxik ?? null,
      }));
      const matches = (await window.electronAPI.receipt.matchProducts(
        matchItems,
      )) as ProductMatch[];

      // Auto-detect supplier from scan result
      if (result.supplierName) {
        const matchedSupplier = suppliers.find((s) => {
          const nameRuLower = s.nameRu.toLowerCase();
          const nameUzLower = s.nameUz.toLowerCase();
          const scannedLower = result.supplierName!.toLowerCase();
          return (
            nameRuLower.includes(scannedLower) ||
            nameUzLower.includes(scannedLower) ||
            scannedLower.includes(nameRuLower) ||
            scannedLower.includes(nameUzLower)
          );
        });
        if (matchedSupplier) {
          setSupplierId(matchedSupplier.id);
        }
      }

      // Build review items
      const items: ReviewItem[] = result.items.map((item, idx) => {
        const match = matches[idx];
        return {
          scannedName: item.scannedName,
          mxik: item.mxik ?? null,
          productId: match?.matchedProductId || "",
          quantity: item.quantity,
          unitCost: item.unitCost,
          confidence: match?.confidence || "none",
          skip: false,
        };
      });

      setReviewItems(items);
      setStep("review");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ANTHROPIC_API_KEY_NOT_SET")) {
        setError(t("receiptScan.apiKeyNotSet"));
      } else if (message.includes("AI_TOKEN_LIMIT_EXCEEDED")) {
        setError(t("receiptScan.tokenLimitExceeded"));
      } else {
        setError(t("receiptScan.scanError") + ": " + message);
      }
      setStep("upload");
    }
  };

  const updateReviewItem = (index: number, updates: Partial<ReviewItem>) => {
    setReviewItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  };

  const handleCreateArrivals = async () => {
    const itemsToCreate = reviewItems.filter(
      (item) => !item.skip && item.productId,
    );
    if (itemsToCreate.length === 0) return;

    setStep("creating");
    setCreateTotal(itemsToCreate.length);
    setCreateProgress(0);

    let failCount = 0;

    for (let i = 0; i < itemsToCreate.length; i++) {
      const item = itemsToCreate[i];
      try {
        await window.electronAPI.inventory.createArrival({
          productId: parseInt(item.productId, 10),
          quantity: item.quantity,
          cost: item.unitCost,
          supplierId: supplierId || undefined,
          paymentMethod: supplierId ? paymentMethod : undefined,
          createdBy: userId,
          notes: `Receipt scan: ${item.scannedName}${item.mxik ? ` [MXIK: ${item.mxik}]` : ""}`,
        });
      } catch (err) {
        console.error("Failed to create arrival for", item.scannedName, err);
        failCount++;
      }
      setCreateProgress(i + 1);
    }

    if (failCount > 0) {
      setError(t("receiptScan.arrivalsFailed"));
    }

    setStep("done");
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  const getStepTitle = () => {
    switch (step) {
      case "upload":
        return t("receiptScan.uploadImage");
      case "scanning":
        return t("receiptScan.scanning");
      case "matching":
        return t("receiptScan.matching");
      case "review":
        return t("receiptScan.reviewTitle");
      case "creating":
        return t("receiptScan.creating");
      case "done":
        return t("receiptScan.done");
    }
  };

  return (
    <>
      <Modal title={getStepTitle()} onClose={onClose} width="900px">
        {/* UPLOAD STEP */}
        {step === "upload" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <DropZone
              $isDragging={isDragging}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={48} style={{ opacity: 0.5 }} />
              <DropZoneText>{t("receiptScan.uploadDescription")}</DropZoneText>
              <DropZoneText style={{ fontSize: 12 }}>
                {t("receiptScan.pasteImage")}
              </DropZoneText>
              <DropZoneText style={{ fontSize: 11, opacity: 0.7 }}>
                JPEG · PNG · WebP · PDF — {t("receiptScan.maxSize")}
              </DropZoneText>
            </DropZone>

            {imageMimeType === "application/pdf" && fileName ? (
              <PdfPreview>
                <FileText size={48} />
                <span>{fileName}</span>
              </PdfPreview>
            ) : imagePreview ? (
              <div style={{ textAlign: "center" }}>
                <PreviewImage src={imagePreview} alt="Receipt preview" />
              </div>
            ) : null}

            {error && <ErrorText>{error}</ErrorText>}

            <Actions>
              <Button variant="secondary" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleScan} disabled={!imageBase64}>
                {t("receiptScan.scanReceipt")}
              </Button>
            </Actions>
          </>
        )}

        {/* SCANNING / MATCHING STEP */}
        {(step === "scanning" || step === "matching") && (
          <SpinnerContainer>
            <Loader2 size={48} />
            <SpinnerText>
              {step === "scanning"
                ? t("receiptScan.scanningDescription")
                : t("receiptScan.matchingDescription")}
            </SpinnerText>
          </SpinnerContainer>
        )}

        {/* REVIEW STEP */}
        {step === "review" && (
          <>
            {scanResult?.supplierName && (
              <StepIndicator>
                <AlertCircle size={16} />
                {t("receiptScan.detectedSupplier")}:{" "}
                <strong>{scanResult.supplierName}</strong>
              </StepIndicator>
            )}

            <SupplierRow>
              <FormGroup>
                <Label>{t("products.supplier")}</Label>
                <FullSelect
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">{t("products.noSupplier")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {i18n.language === "uz" ? s.nameUz : s.nameRu}
                    </option>
                  ))}
                </FullSelect>
              </FormGroup>
              {supplierId && (
                <FormGroup>
                  <Label>{t("suppliers.paymentMethod")}</Label>
                  <FullSelect
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as SupplierPaymentMethod)
                    }
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {getPaymentMethodLabel(m)}
                      </option>
                    ))}
                  </FullSelect>
                </FormGroup>
              )}
            </SupplierRow>

            <div style={{ overflowX: "auto" }}>
              <ReviewTable>
                <thead>
                  <tr>
                    <Th style={{ width: 30 }}></Th>
                    <Th>{t("receiptScan.scannedName")}</Th>
                    <Th style={{ width: 130 }}>MXIK</Th>
                    <Th>{t("receiptScan.matchedProduct")}</Th>
                    <Th style={{ width: 80 }}>{t("receiptScan.confidence")}</Th>
                    <Th style={{ width: 90 }}>{t("receiptScan.quantity")}</Th>
                    <Th style={{ width: 100 }}>{t("receiptScan.unitCost")}</Th>
                    <Th style={{ width: 100 }}>{t("receiptScan.totalCost")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {reviewItems.map((item, idx) => (
                    <tr key={idx} style={{ opacity: item.skip ? 0.4 : 1 }}>
                      <Td>
                        <SkipCheckbox
                          type="checkbox"
                          checked={!item.skip}
                          onChange={(e) =>
                            updateReviewItem(idx, { skip: !e.target.checked })
                          }
                          title={t("receiptScan.skipItem")}
                        />
                      </Td>
                      <Td>{item.scannedName}</Td>
                      <Td
                        style={{
                          fontSize: 11,
                          opacity: 0.6,
                          fontFamily: "monospace",
                        }}
                      >
                        {item.mxik || "—"}
                      </Td>
                      <Td>
                        <div
                          style={{
                            display: "flex",
                            gap: "4px",
                            alignItems: "center",
                          }}
                        >
                          <ProductSelect
                            value={item.productId}
                            onChange={(e) =>
                              updateReviewItem(idx, {
                                productId: e.target.value,
                                confidence: e.target.value ? "high" : "none",
                              })
                            }
                            disabled={item.skip}
                            style={{ flex: 1 }}
                          >
                            <option value="">
                              {t("receiptScan.selectProduct")}
                            </option>
                            {localProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {getProductName(p)}
                              </option>
                            ))}
                          </ProductSelect>
                          {!item.productId && !item.skip && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="small"
                              title={t("products.addProduct")}
                              style={{ flexShrink: 0, padding: "4px 6px" }}
                              onClick={() => setAddingForRowIdx(idx)}
                            >
                              <PlusCircle size={15} />
                            </Button>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <ConfidenceBadge $level={item.confidence}>
                          {getConfidenceLabel(item.confidence)}
                        </ConfidenceBadge>
                      </Td>
                      <Td>
                        <NumberInput
                          type="number"
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            updateReviewItem(idx, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          disabled={item.skip}
                        />
                      </Td>
                      <Td>
                        <NumberInput
                          type="number"
                          step="any"
                          value={item.unitCost}
                          onChange={(e) =>
                            updateReviewItem(idx, {
                              unitCost: parseFloat(e.target.value) || 0,
                            })
                          }
                          disabled={item.skip}
                        />
                      </Td>
                      <Td style={{ textAlign: "right", fontWeight: 600 }}>
                        {(item.quantity * item.unitCost).toLocaleString()}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </ReviewTable>
            </div>

            {error && <ErrorText>{error}</ErrorText>}

            <Actions>
              <Button variant="secondary" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleCreateArrivals}
                disabled={
                  reviewItems.filter((i) => !i.skip && i.productId).length === 0
                }
              >
                {t("receiptScan.createArrivals")} (
                {reviewItems.filter((i) => !i.skip && i.productId).length})
              </Button>
            </Actions>
          </>
        )}

        {/* CREATING STEP */}
        {step === "creating" && (
          <SpinnerContainer>
            <Loader2 size={48} />
            <SpinnerText>
              {t("receiptScan.progress", {
                current: createProgress,
                total: createTotal,
              })}
            </SpinnerText>
            <ProgressBar>
              <ProgressFill
                $percent={
                  createTotal > 0 ? (createProgress / createTotal) * 100 : 0
                }
              />
            </ProgressBar>
          </SpinnerContainer>
        )}

        {/* DONE STEP */}
        {step === "done" && (
          <>
            <SuccessContainer>
              <CheckCircle size={64} />
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                {t("receiptScan.doneDescription")}
              </p>
              {error && <ErrorText>{error}</ErrorText>}
            </SuccessContainer>
            <Actions>
              <Button onClick={handleDone}>{t("common.close")}</Button>
            </Actions>
          </>
        )}
      </Modal>

      {addingForRowIdx !== null &&
        (() => {
          const row = reviewItems[addingForRowIdx];
          return (
            <ProductForm
              initialData={{
                nameRu: row.scannedName,
                nameUz: row.scannedName,
                mxik: row.mxik || undefined,
                cost: row.unitCost || undefined,
              }}
              onClose={() => setAddingForRowIdx(null)}
              onSuccess={handleProductCreated}
            />
          );
        })()}
    </>
  );
}
