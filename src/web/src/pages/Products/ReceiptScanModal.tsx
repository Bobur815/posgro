import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  PlusCircle,
  Tag,
  Package,
} from "lucide-react";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";
import { ProductForm } from "./ProductForm";
import {
  Supplier,
  SupplierPaymentMethod,
  ScannedReceiptData,
  ProductMatch,
  Product,
} from "@shared/types";
import {
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_I18N_KEYS,
} from "@shared/constants/payment-methods";
import {
  receipt as receiptApi,
  inventory,
  products as productsApi,
  mxik as mxikApi,
  MxikScanInfo,
} from "../../api/client";
import { debounce } from "../../utils/helpers";

type Step = "upload" | "scanning" | "matching" | "review" | "creating" | "done";

interface ReceiptScanModalProps {
  suppliers: Supplier[];
  products: Product[];
  userId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Shared styled components ────────────────────────────────────────────────

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

const SearchInput = styled.input<{ $selected?: boolean }>`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: text;

  @media (max-width: 640px) {
    font-size: 16px; /* prevents iOS zoom */
    padding: 8px 10px;
  }
`;

const SearchWrapper = styled.div`
  position: relative;
  flex: 1;
`;

const SearchDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  margin-top: 2px;
`;

const SearchDropdownItem = styled.div<{ $active?: boolean }>`
  padding: 8px 10px;
  min-height: 40px;
  display: flex;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary + "20" : "transparent"};
  color: ${({ theme }) => theme.colors.text};
  &:hover {
    background: ${({ theme }) => theme.colors.primary + "15"};
  }

  @media (max-width: 640px) {
    min-height: 48px;
    font-size: 14px;
  }
`;

const NumberInput = styled.input`
  width: 90px;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  text-align: right;

  @media (max-width: 640px) {
    width: 100%;
    font-size: 16px;
    padding: 8px 10px;
  }
`;

const SupplierRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const FormGroup = styled.div`
  flex: 1;
  min-width: 160px;
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

  @media (max-width: 480px) {
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
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

// ─── Review card styled components ───────────────────────────────────────────

const ItemCard = styled.div<{ $skip?: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  opacity: ${({ $skip }) => ($skip ? 0.45 : 1)};
  transition: opacity 0.15s;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CardCheckbox = styled.input`
  width: 18px;
  height: 18px;
  min-width: 18px;
  cursor: pointer;
  margin-top: 3px;
`;

const CardHeaderContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ScannedNameText = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  word-break: break-word;
  line-height: 1.3;
`;

const CardBadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  flex-wrap: wrap;
`;

const MxikChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 8px;
  font-size: 10px;
  font-family: monospace;
  background: ${({ theme }) => theme.colors.primary}18;
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 600;
  letter-spacing: 0.02em;
`;

const MxikInfoBlock = styled.div`
  margin-top: ${({ theme }) => theme.spacing.sm};
  padding: 8px 10px;
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  border-left: 3px solid ${({ theme }) => theme.colors.primary}40;
`;

const MxikBrandRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
`;

const MxikBrand = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const MxikAttribute = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const MxikUnitsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
`;

const CardDivider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const CardSection = styled.div``;

const CardSectionLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 5px;
  letter-spacing: 0.05em;
`;

const CardAmountRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  @media (max-width: 400px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const AmountField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const AmountLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const TotalDisplay = styled.div`
  margin-left: auto;
  text-align: right;
`;

// ─── ReviewItem ───────────────────────────────────────────────────────────────

interface ReviewItem {
  scannedName: string;
  mxik: string | null;
  mxikInfo?: MxikScanInfo;
  productId: string;
  quantity: number;
  unitCost: number;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  skip: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReceiptScanModal({
  suppliers,
  products,
  userId,
  onClose,
  onSuccess,
}: ReceiptScanModalProps) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TODO: revert to "upload" before shipping
  const [step, setStep] = useState<Step>("review");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanResult, setScanResult] = useState<ScannedReceiptData | null>(null);
  // TODO: revert to [] before shipping
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([
    {
      scannedName: "Coca Cola PET 0.5L",
      mxik: "02202002001010007",
      mxikInfo: { name: "Coca-Cola", brandName: "Coca-Cola", attributeName: "0.5L", unitsName: "шт", groupCode: "022" },
      productId: "",
      quantity: 96,
      unitCost: 5859,
      confidence: "none",
      skip: false,
    },
    {
      scannedName: "Lipton Ice Tea Peach 0.5L",
      mxik: "02202001001010001",
      mxikInfo: { name: "Lipton Ice Tea", brandName: "Lipton", attributeName: "Peach 0.5L", unitsName: "шт", groupCode: "022" },
      productId: "",
      quantity: 24,
      unitCost: 6500,
      confidence: "none",
      skip: false,
    },
    {
      scannedName: "Картошка белая кг",
      mxik: "01905012001000000",
      mxikInfo: { name: "Картошка", brandName: null, attributeName: "белая", unitsName: "кг", groupCode: "019" },
      productId: "",
      quantity: 50,
      unitCost: 4500,
      confidence: "none",
      skip: false,
    },
    {
      scannedName: "Unknown XYZ Product",
      mxik: null,
      mxikInfo: undefined,
      productId: "",
      quantity: 10,
      unitCost: 15000,
      confidence: "none",
      skip: false,
    },
    {
      scannedName: "Fanta Orange 1L",
      mxik: "02202002001010010",
      mxikInfo: { name: "Fanta", brandName: "Fanta", attributeName: "Orange 1L", unitsName: "шт", groupCode: "022" },
      productId: "",
      quantity: 12,
      unitCost: 8500,
      confidence: "none",
      skip: true,
    },
  ]);
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPaymentMethod>("CASH");

  useEffect(() => {
    if (!supplierId) setPaymentMethod("CASH");
  }, [supplierId]);

  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [addingForRowIdx, setAddingForRowIdx] = useState<number | null>(null);

  useEffect(() => {
    productsApi.getAll()
      .then((data) => setLocalProducts(data as Product[]))
      .catch(() => {});
  }, []);

  const [createProgress, setCreateProgress] = useState(0);
  const [createTotal, setCreateTotal] = useState(0);

  const [rowSearches, setRowSearches] = useState<Record<number, string>>({});
  const [rowFilters, setRowFilters] = useState<Record<number, string>>({});
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);

  const debouncedSetFilter = useRef(
    debounce((idx: number, value: string) => {
      setRowFilters((prev) => ({ ...prev, [idx]: value }));
    }, 200),
  ).current;

  const handleInputChange = (idx: number, value: string) => {
    setRowSearches((prev) => ({ ...prev, [idx]: value }));
    debouncedSetFilter(idx, value);
  };

  const handleInputFocus = (idx: number) => {
    setRowSearches((prev) => ({ ...prev, [idx]: "" }));
    setRowFilters((prev) => ({ ...prev, [idx]: "" }));
    setOpenDropdownIdx(idx);
  };

  const handleInputBlur = (idx: number) => {
    setTimeout(() => {
      setOpenDropdownIdx((prev) => (prev === idx ? null : prev));
    }, 150);
  };

  const handleProductSelect = (idx: number, productId: string) => {
    updateReviewItem(idx, {
      productId,
      confidence: productId ? "high" : "none",
    });
    setOpenDropdownIdx(null);
    setRowSearches((prev) => ({ ...prev, [idx]: "" }));
    setRowFilters((prev) => ({ ...prev, [idx]: "" }));
  };

  const getInputDisplayValue = (idx: number, item: ReviewItem) => {
    if (openDropdownIdx === idx) return rowSearches[idx] || "";
    if (item.productId) {
      const p = localProducts.find((p) => String(p.id) === item.productId);
      return p ? getProductName(p) : "";
    }
    return "";
  };

  const getFilteredProducts = (idx: number) => {
    const filter = (rowFilters[idx] || "").toLowerCase();
    if (!filter) return localProducts;
    return localProducts.filter(
      (p) =>
        p.nameRu.toLowerCase().includes(filter) ||
        p.nameUz.toLowerCase().includes(filter),
    );
  };

  const handleProductCreated = async () => {
    const updated = (await productsApi.getAll()) as Product[];
    setLocalProducts(updated);

    if (addingForRowIdx !== null) {
      const row = reviewItems[addingForRowIdx];

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

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
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
          setImagePreview(null);
        } else {
          setImagePreview(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    },
    [t],
  );

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
      const result = (await receiptApi.scan(
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

      const matchItems = result.items.map((item) => ({
        name: item.scannedName,
        mxik: item.mxik ?? null,
      }));
      const matches = (await receiptApi.matchProducts(
        matchItems,
      )) as ProductMatch[];

      // MXIK enrichment — browser calls tasnif.soliq.uz directly (VPS is geo-blocked)
      const mxikCodes = result.items
        .map((item) => item.mxik)
        .filter((code): code is string => !!code);

      let mxikInfoMap: Record<string, MxikScanInfo> = {};
      if (mxikCodes.length > 0) {
        try {
          mxikInfoMap = await mxikApi.lookupBatch(mxikCodes);
        } catch {
          // non-fatal: proceed without MXIK enrichment
        }
      }

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

      const items: ReviewItem[] = result.items.map((item, idx) => {
        const match = matches[idx];
        return {
          scannedName: item.scannedName,
          mxik: item.mxik ?? null,
          mxikInfo: item.mxik ? mxikInfoMap[item.mxik] : undefined,
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
        await inventory.createArrival({
          productId: item.productId,
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

  const isBulkWeighted = (info?: MxikScanInfo) => info?.groupCode === "019";

  const activeCount = reviewItems.filter((i) => !i.skip && i.productId).length;

  return (
    <>
      <Modal title={getStepTitle()} onClose={onClose} width="760px">
        {/* ── Upload ── */}
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

        {/* ── Scanning / Matching spinner ── */}
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

        {/* ── Review ── */}
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
                    {SUPPLIER_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(SUPPLIER_PAYMENT_METHOD_I18N_KEYS[m])}
                      </option>
                    ))}
                  </FullSelect>
                </FormGroup>
              )}
            </SupplierRow>

            {/* Item cards */}
            <div>
              {reviewItems.map((item, idx) => (
                <ItemCard key={idx} $skip={item.skip}>
                  {/* Header: checkbox + name + badges */}
                  <CardHeader>
                    <CardCheckbox
                      type="checkbox"
                      checked={!item.skip}
                      onChange={(e) =>
                        updateReviewItem(idx, { skip: !e.target.checked })
                      }
                    />
                    <CardHeaderContent>
                      <ScannedNameText>{item.scannedName}</ScannedNameText>
                      <CardBadgeRow>
                        {item.mxik && (
                          <MxikChip>
                            <Tag size={9} />
                            {item.mxik}
                          </MxikChip>
                        )}
                        <ConfidenceBadge $level={item.confidence}>
                          {getConfidenceLabel(item.confidence)}
                        </ConfidenceBadge>
                      </CardBadgeRow>
                    </CardHeaderContent>
                  </CardHeader>

                  {/* MXIK enrichment block */}
                  {item.mxikInfo && (
                    <MxikInfoBlock>
                      <MxikBrandRow>
                        {item.mxikInfo.brandName && (
                          <MxikBrand>{item.mxikInfo.brandName}</MxikBrand>
                        )}
                        {item.mxikInfo.attributeName && (
                          <MxikAttribute>
                            {item.mxikInfo.attributeName}
                          </MxikAttribute>
                        )}
                      </MxikBrandRow>
                      {item.mxikInfo.unitsName && (
                        <MxikUnitsRow>
                          <Package size={10} />
                          {item.mxikInfo.unitsName}
                        </MxikUnitsRow>
                      )}
                    </MxikInfoBlock>
                  )}

                  <CardDivider />

                  {/* Product match */}
                  <CardSection>
                    <CardSectionLabel>
                      {t("receiptScan.matchedProduct")}
                    </CardSectionLabel>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        alignItems: "center",
                      }}
                    >
                      <SearchWrapper>
                        <SearchInput
                          type="text"
                          placeholder={t("receiptScan.selectProduct")}
                          value={getInputDisplayValue(idx, item)}
                          $selected={
                            !!item.productId && openDropdownIdx !== idx
                          }
                          onFocus={() => handleInputFocus(idx)}
                          onBlur={() => handleInputBlur(idx)}
                          onChange={(e) =>
                            handleInputChange(idx, e.target.value)
                          }
                          disabled={item.skip}
                        />
                        {openDropdownIdx === idx && (
                          <SearchDropdown>
                            {getFilteredProducts(idx).length === 0 ? (
                              <SearchDropdownItem
                                style={{ opacity: 0.5, cursor: "default" }}
                              >
                                {t("common.noResults") || "No results"}
                              </SearchDropdownItem>
                            ) : (
                              getFilteredProducts(idx).map((p) => (
                                <SearchDropdownItem
                                  key={p.id}
                                  $active={String(p.id) === item.productId}
                                  onMouseDown={() =>
                                    handleProductSelect(idx, String(p.id))
                                  }
                                >
                                  {getProductName(p)}
                                </SearchDropdownItem>
                              ))
                            )}
                          </SearchDropdown>
                        )}
                      </SearchWrapper>
                      {!item.productId && !item.skip && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="small"
                          title={t("products.add")}
                          style={{ flexShrink: 0, padding: "8px 10px" }}
                          onClick={() => setAddingForRowIdx(idx)}
                        >
                          <PlusCircle size={18} />
                        </Button>
                      )}
                    </div>
                  </CardSection>

                  {/* Qty / Cost / Total */}
                  <CardAmountRow>
                    <div style={{ display: 'flex', gap: '8px'}}>
                      <AmountField>
                      <AmountLabel>
                        {t("receiptScan.quantity")}
                        {isBulkWeighted(item.mxikInfo) && (
                          <span style={{ marginLeft: 4, fontWeight: 700 }}>(кг)</span>
                        )}
                      </AmountLabel>
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
                    </AmountField>
                    <AmountField>
                      <AmountLabel>{t("receiptScan.unitCost")}</AmountLabel>
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
                    </AmountField>
                    </div>
                    <TotalDisplay>
                      <AmountLabel style={{ textAlign: "right" }}>
                        {t("receiptScan.totalCost")}
                      </AmountLabel>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {(item.quantity * item.unitCost).toLocaleString()}
                      </div>
                    </TotalDisplay>
                  </CardAmountRow>
                </ItemCard>
              ))}
            </div>

            {error && <ErrorText>{error}</ErrorText>}

            <Actions>
              <Button variant="secondary" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleCreateArrivals}
                disabled={activeCount === 0}
              >
                {t("receiptScan.createArrivals")} ({activeCount})
              </Button>
            </Actions>
          </>
        )}

        {/* ── Creating ── */}
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

        {/* ── Done ── */}
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
                stock: row.quantity || undefined,
                groupCode: row.mxikInfo?.groupCode || undefined,
              }}
              onClose={() => setAddingForRowIdx(null)}
              onSuccess={handleProductCreated}
            />
          );
        })()}
    </>
  );
}
