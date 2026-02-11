import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Cart } from "./Cart";
import { ProductSearch } from "./ProductSearch";
import { Checkout } from "./Checkout";
import { PosTabBar } from "./PosTabBar";
import { useCartStore } from "../../store/cart-store";
import { useProducts } from "../../hooks/useProducts";
import { useSales } from "../../hooks/useSales";
import { useToast } from "../../context/ToastContext";
import { Delete, SendHorizontal, Trash } from "lucide-react";

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  height: calc(100vh - 20px);
`;

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 450px;
  grid-template-rows: 1fr;
  gap: ${({ theme }) => theme.spacing.md};
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const LeftSection = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  min-height: 0;
  overflow: hidden;
`;

const InputSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InputPanel = styled.div`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.md};
`;

const InputLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  text-transform: uppercase;
`;

const InputDisplay = styled.div<{ $active?: boolean }>`
  font-size: 24px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
  padding: ${({ theme }) => theme.spacing.sm};
  background-color: ${({ theme }) => theme.colors.background};
  border: 2px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  min-height: 48px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: border-color 0.2s;
`;

const NumberPadSection = styled.div`
  min-width: 400px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.md};
`;

const NumberPad = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`;

const NumButton = styled.button<{ $variant?: "action" | "clear" | "enter" }>`
  height: 70px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 24px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
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
    $variant === "action" &&
    `
    background-color: ${theme.colors.primary}10;
    border-color: ${theme.colors.primary}50;
    color: ${theme.colors.primary};
    font-size: 14px;
    &:hover {
      background-color: ${theme.colors.primary}20;
    }
  `}

  ${({ $variant, theme }) =>
    $variant === "clear" &&
    `
    background-color: ${theme.colors.error}10;
    border-color: ${theme.colors.error}50;
    color: ${theme.colors.error};
    font-size: 14px;
    &:hover {
      background-color: ${theme.colors.error}20;
    }
  `}

  ${({ $variant, theme }) =>
    $variant === "enter" &&
    `
    background-color: ${theme.colors.success};
    border-color: ${theme.colors.success};
    color: white;
    font-size: 16px;
    &:hover {
      opacity: 0.9;
    }
  `}
`;

const ProductsSection = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const CartSection = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
  height: 0;
  min-height: 100%;
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error}15;
  color: ${({ theme }) => theme.colors.error};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  text-align: center;
`;

interface Product {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  price: number;
  stock: number;
  minStock: number;
  unit?: string;
  pendingPrice?: number | null;
  pendingPriceThreshold?: number | null;
}

type InputMode = "barcode" | "quantity" | "id";

export function POSScreen() {
  const { t, i18n } = useTranslation();
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [id, setId] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("barcode");
  const [showCheckout, setShowCheckout] = useState(false);
  const [error, setError] = useState("");

  const { addItem, items, discount, clearCart, activeTabId, editingSaleId } = useCartStore();
  const { searchByBarcode, getById } = useProducts();
  const { createSale, updateSale, isLoading: isPayingLoading } = useSales();
  const toast = useToast();
  const payingRef = useRef(false);

  const addProductToCart = useCallback(
    (product: Product, qty: number) => {
      const productName =
        i18n.language === "uz" ? product.nameUz : product.nameRu;

      const hasPending =
        product.pendingPrice != null &&
        product.pendingPriceThreshold != null &&
        product.pendingPrice !== product.price;

      if (hasPending) {
        const oldPrice = Number(product.price);
        const newPrice = Number(product.pendingPrice!);
        const threshold = product.pendingPriceThreshold!;
        // Old stock = total stock - threshold (portion at old price)
        const totalOldStock = product.stock - threshold;

        // Check how much of old-price stock is already in cart
        const alreadyInCartOld = items
          .filter((i) => i.productId === product.id && i.unitPrice === oldPrice)
          .reduce((sum, i) => sum + i.quantity, 0);

        const remainingOldStock = Math.max(0, totalOldStock - alreadyInCartOld);

        if (remainingOldStock <= 0) {
          // All old stock used up, add at new price
          addItem({
            productId: product.id,
            productName,
            barcode: product.barcode,
            unitPrice: newPrice,
            quantity: qty,
            stock: threshold,
            unit: product.unit,
          });
        } else if (qty <= remainingOldStock) {
          // Fits entirely in old stock
          addItem({
            productId: product.id,
            productName,
            barcode: product.barcode,
            unitPrice: oldPrice,
            quantity: qty,
            stock: totalOldStock,
            unit: product.unit,
          });
        } else {
          // Split: fill old stock, rest at new price
          addItem({
            productId: product.id,
            productName,
            barcode: product.barcode,
            unitPrice: oldPrice,
            quantity: remainingOldStock,
            stock: totalOldStock,
            unit: product.unit,
          });
          addItem({
            productId: product.id,
            productName,
            barcode: product.barcode,
            unitPrice: newPrice,
            quantity: qty - remainingOldStock,
            stock: threshold,
            unit: product.unit,
          });
        }
        return;
      }

      // Normal add (no pending price)
      addItem({
        productId: product.id,
        productName,
        barcode: product.barcode,
        unitPrice: Number(product.price),
        quantity: qty,
        stock: product.stock,
        unit: product.unit,
      });
    },
    [addItem, items, i18n.language],
  );

  // Reset local input state when switching tabs
  useEffect(() => {
    setBarcode("");
    setQuantity("1");
    setId("");
    setInputMode("barcode");
    setError("");
  }, [activeTabId]);

  const handleIdSubmit = useCallback(async () => {
    if (!id.trim()) return;

    try {
      const product = (await getById(id.trim())) as Product | null;
      if (product) {
        const qty = parseFloat(quantity) || 1;
        addProductToCart(product, qty);

        setId("");
        setBarcode("");
        setQuantity("1");
        setInputMode("barcode");
        setError("");
      } else {
        setError(t("products.noResults"));
        setId("");
      }
    } catch (err) {
      console.error("Error looking up product by ID:", err);
      setError(t("products.noResults"));
      setId("");
    }
  }, [id, quantity, getById, addProductToCart, t]);

  const handleBarcodeSubmit = useCallback(async () => {
    if (inputMode === "id") {
      return handleIdSubmit();
    }

    if (!barcode.trim()) {
      setError(t("pos.enterBarcode"));
      return;
    }

    try {
      const product = (await searchByBarcode(barcode.trim())) as Product | null;
      if (product) {
        const qty = parseFloat(quantity) || 1;
        addProductToCart(product, qty);

        // Reset inputs
        setBarcode("");
        setQuantity("1");
        setInputMode("barcode");
        setError("");
      } else {
        setError(t("products.noResults"));
      }
    } catch (err) {
      console.error("Error searching product:", err);
      setError(t("common.error"));
    }
  }, [
    inputMode,
    barcode,
    quantity,
    searchByBarcode,
    addProductToCart,
    t,
    handleIdSubmit,
  ]);

  const handleQuickPay = useCallback(
    async (method: "cash" | "card") => {
      if (items.length === 0 || payingRef.current) return;
      payingRef.current = true;

      try {
        const saleData = {
          items: items.map((item) => ({
            productId: String(item.productId),
            productName: item.productName,
            barcode: item.barcode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          paymentMethod: method,
          discountAmount: discount,
        };

        const sale = editingSaleId
          ? await updateSale(editingSaleId, saleData)
          : await createSale(saleData);

        if (sale) {
          clearCart();
          window.dispatchEvent(new Event("stock-updated"));
          toast.success(
            editingSaleId
              ? t("pos.saleUpdated")
              : `${t("pos.paymentComplete")} — ${t("pos.receiptNumber")}: ${sale.receiptNumber}`,
          );
        }
      } catch (err) {
        console.error("Quick pay failed:", err);
        toast.error(t("common.error"));
      } finally {
        payingRef.current = false;
      }
    },
    [items, discount, editingSaleId, createSale, updateSale, clearCart, toast, t],
  );

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if checkout modal is open
      if (showCheckout) return;

      // Let native inputs handle their own keyboard events
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Number keys
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (inputMode === "barcode") {
          setBarcode((prev) => prev + e.key);
        } else if (inputMode === "id") {
          setId((prev) => prev + e.key);
        } else {
          setQuantity((prev) => (prev === "0" ? e.key : prev + e.key));
        }
        setError("");
      }
      // Backspace
      else if (e.key === "Backspace") {
        e.preventDefault();
        if (inputMode === "barcode") {
          setBarcode((prev) => prev.slice(0, -1));
        } else if (inputMode === "id") {
          setId((prev) => prev.slice(0, -1));
        } else {
          setQuantity((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
        }
      }
      // Enter - submit barcode
      else if (e.key === "Enter") {
        e.preventDefault();
        handleBarcodeSubmit();
      }
      // Tab - switch input mode
      else if (e.key === "Tab") {
        e.preventDefault();
        setInputMode((prev) => (prev === "barcode" ? "quantity" : "barcode"));
      }
      // Escape - clear
      else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
      // . - add decimal point in quantity mode
      else if (e.key === "." && inputMode === "quantity") {
        e.preventDefault();
        if (!quantity.includes(".")) {
          setQuantity((prev) => prev + ".");
        }
      }
      // * - switch to quantity
      else if (e.key === "*") {
        e.preventDefault();
        setInputMode("quantity");
      }
      // F10 - open checkout
      else if (e.key === "F10") {
        e.preventDefault();
        if (items.length > 0) {
          setShowCheckout(true);
        }
      }
      // F11 - quick pay cash
      else if (e.key === "F11") {
        e.preventDefault();
        handleQuickPay("cash");
      }
      // F12 - quick pay card
      else if (e.key === "F12") {
        e.preventDefault();
        handleQuickPay("card");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputMode, barcode, quantity, showCheckout, handleBarcodeSubmit, handleQuickPay]);

  const handleNumberClick = (num: string) => {
    if (inputMode === "barcode") {
      setBarcode((prev) => prev + num);
    } else if (inputMode === "id") {
      setId((prev) => prev + num);
    } else {
      setQuantity((prev) => (prev === "0" ? num : prev + num));
    }
    setError("");
  };

  const handleBackspace = () => {
    if (inputMode === "barcode") {
      setBarcode((prev) => prev.slice(0, -1));
    } else if (inputMode === "id") {
      setId((prev) => prev.slice(0, -1));
    } else {
      setQuantity((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
    }
  };

  const handleClear = () => {
    if (inputMode === "barcode") {
      setBarcode("");
    } else if (inputMode === "id") {
      setId("");
    } else {
      setQuantity("1");
    }
    setError("");
  };

  const handleProductSelect = (product: Product) => {
    const qty = parseFloat(quantity) || 1;
    addProductToCart(product, qty);
    setQuantity("1");
    setError("");
  };

  const handleCheckoutComplete = () => {
    setShowCheckout(false);
  };

  return (
    <PageWrapper>
      <PosTabBar />
      <Container>
        <LeftSection>
          <ProductsSection>
            <ProductSearch onSelect={handleProductSelect} />
          </ProductsSection>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              minHeight: 0,
            }}
          >
            <InputSection>
              <InputPanel>
                <InputLabel>{t("pos.barcode")}</InputLabel>
                <InputDisplay
                  $active={inputMode === "barcode"}
                  onClick={() => setInputMode("barcode")}
                >
                  {barcode || "—"}
                </InputDisplay>
              </InputPanel>

              <div style={{ display: "flex", gap: "16px", flex: 1 }}>
                <InputPanel>
                  <InputLabel>{t("pos.id")}</InputLabel>
                  <InputDisplay
                    $active={inputMode === "id"}
                    onClick={() => setInputMode("id")}
                  >
                    {id || "—"}
                  </InputDisplay>
                </InputPanel>

                <InputPanel>
                  <InputLabel>{t("pos.quantity")}</InputLabel>
                  <InputDisplay
                    $active={inputMode === "quantity"}
                    onClick={() => setInputMode("quantity")}
                  >
                    {quantity}
                  </InputDisplay>
                </InputPanel>
              </div>
            </InputSection>

            <NumberPadSection>
              {error && <ErrorMessage>{error}</ErrorMessage>}
              <NumberPad>
                {["7", "8", "9"].map((num) => (
                  <NumButton key={num} onClick={() => handleNumberClick(num)}>
                    {num}
                  </NumButton>
                ))}
                <NumButton $variant="clear" onClick={handleClear}>
                  <Trash size={30} />
                </NumButton>

                {["4", "5", "6"].map((num) => (
                  <NumButton key={num} onClick={() => handleNumberClick(num)}>
                    {num}
                  </NumButton>
                ))}
                <NumButton $variant="action" onClick={handleBackspace}>
                  <Delete size={30} />
                </NumButton>

                {["1", "2", "3"].map((num) => (
                  <NumButton key={num} onClick={() => handleNumberClick(num)}>
                    {num}
                  </NumButton>
                ))}
                <NumButton
                  $variant="action"
                  onClick={() =>
                    setInputMode(
                      inputMode === "barcode" ? "quantity" : "barcode",
                    )
                  }
                >
                  {inputMode === "barcode" ? "QTY" : "BAR"}
                </NumButton>

                <NumButton onClick={() => handleNumberClick("00")}>
                  00
                </NumButton>
                <NumButton onClick={() => handleNumberClick("0")}>0</NumButton>
                <NumButton onClick={() => handleNumberClick(".")}>.</NumButton>
                <NumButton $variant="enter" onClick={handleBarcodeSubmit}>
                  <SendHorizontal size={30} />
                </NumButton>
              </NumberPad>
              
            </NumberPadSection>
          </div>
        </LeftSection>

        <CartSection>
          <Cart
            onCheckout={() => setShowCheckout(true)}
            onQuickPay={handleQuickPay}
            isQuickPayDisabled={isPayingLoading}
          />
        </CartSection>

        {showCheckout && (
          <Checkout
            onComplete={handleCheckoutComplete}
            onCancel={() => setShowCheckout(false)}
          />
        )}
      </Container>
    </PageWrapper>
  );
}
