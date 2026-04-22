ASL-BELGISI Integration Guide
Grocery POS — Product Marking Code Verification

Vibe coding guide for Claude Code in terminal.
Copy-paste these prompts directly into your Claude Code session. Each section builds on the previous one.

What Is asl-belgisi and Why Do You Need It
asl-belgisi (National Information System for Monitoring Marking and Tracking of Products) — Uzbekistan's mandatory product tracking system. Every marked product has a unique DataMatrix code that must be verified before sale.
Why integrate:

✅ Verify product authenticity (prevent counterfeit goods)
✅ Auto-populate product data from government registry
✅ Check marking code status (ensure not withdrawn/recalled)
✅ Get production/expiry dates from marking code
✅ Comply with government tracking requirements

The good news: The public verification API requires NO authentication — unlike the product registry which needs business registration.

Architecture Overview
ProductForm (Frontend)
└── Scans DataMatrix QR code
└── Detects QR type (fiscal/datamatrix/mxik/barcode)
└── If DataMatrix:
├── Extract GTIN (barcode)
│
├── Step 1: Verify with asl-belgisi (client-side, no auth)
│ └── POST /public/api/cod/public/codes
│ └── Returns: MC status, dates, issuer info
│
├── Step 2: Check local database
│ └── GET /api/products/barcode/{gtin}
│
└── Step 3: Lookup in tasnif.soliq.uz (client-side, no auth)
└── Returns: names (RU/UZ), MXIK code, packageCode
└── Merge data → auto-populate form

Key Insight: Hybrid Approach
We use TWO government APIs to get complete product data:
Data FieldSourceAuth Required?Geo-Blocked?Product names (RU/UZ)tasnif.soliq.uz❌ No✅ Yes (UZ only)MXIK codetasnif.soliq.uz❌ No✅ Yes (UZ only)Package codetasnif.soliq.uz❌ No✅ Yes (UZ only)MC verificationasl-belgisi❌ No❌ NoMC statusasl-belgisi❌ No❌ NoProduction dateasl-belgisi❌ No❌ NoExpiry dateasl-belgisi❌ No❌ No
Solution: Call both from client-side (user's browser in Uzbekistan) ✅

Step 1 — Add asl-belgisi Client Functions
Prompt for Claude Code:
In src/web/src/api/client.ts, after the existing mxik export section,
add a new section called "ASL-BELGISI" with these functions:

1. verifyMarkingCode(markingCode) - calls POST /public/api/cod/public/codes
   Returns: { isValid, status, extendedStatus, gtin, productionDate, expirationDate, issuerName, packageType }

2. extractGtinFromDataMatrix(dataMatrix) - regex extracts GTIN from DataMatrix format "01{GTIN(14)}..."
   Returns: string | null

3. detectQrType(qrData) - detects if QR is 'fiscal', 'datamatrix', 'mxik', or 'barcode'
   Returns: 'fiscal' | 'datamatrix' | 'mxik' | 'barcode'

Use fetch API (not axios). API base URL: https://xtrace.aslbelgisi.uz/public/api
All calls are client-side, no auth headers needed.
Reference implementation:
typescript// ─── ASL-BELGISI (Client-side - Public endpoints only) ──────────────────────

export const aslBelgisi = {
/\*\*

- Verify marking code (MC) authenticity and get status
- Uses PUBLIC endpoint - NO authentication required
  \*/
  verifyMarkingCode: async (markingCode: string): Promise<{
  isValid: boolean;
  status?: string;
  extendedStatus?: string;
  gtin?: string;
  productId?: string;
  emissionDate?: string;
  productionDate?: string;
  expirationDate?: string;
  productSeries?: string;
  issuerName?: string;
  packageType?: string;
  }> => {
  const ASL_BELGISI = 'https://xtrace.aslbelgisi.uz/public/api';


    try {
      const response = await fetch(`${ASL_BELGISI}/cod/public/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: [markingCode],
          addCodeHistory: false
        }),
      });

      if (!response.ok) return { isValid: false };

      const data = await response.json();
      if (!data || !data.length) return { isValid: false };

      const mcInfo = data[0];

      return {
        isValid: true,
        status: mcInfo.status,
        extendedStatus: mcInfo.extendedStatus,
        gtin: mcInfo.gtin,
        productId: mcInfo.productId,
        emissionDate: mcInfo.emissionDate,
        productionDate: mcInfo.productionDate,
        expirationDate: mcInfo.expirationDate,
        productSeries: mcInfo.productSeries,
        issuerName: mcInfo.issuerShortInfo?.issuerName?.ru,
        packageType: mcInfo.packageType,
      };
    } catch (error) {
      console.error('MC verification failed:', error);
      return { isValid: false };
    }

},

extractGtinFromDataMatrix: (dataMatrix: string): string | null => {
const match = dataMatrix.match(/^01(\d{14})/);
return match ? match[1] : null;
},

detectQrType: (qrData: string): 'fiscal' | 'datamatrix' | 'mxik' | 'barcode' => {
if (qrData.includes('http://') || qrData.includes('https://')) {
return 'fiscal';
}
if (/^01\d{14}/.test(qrData)) {
return 'datamatrix';
}
if (/^\d{17}$/.test(qrData)) {
return 'mxik';
}
return 'barcode';
},
};

Step 2 — Add Smart QR Scanner to ProductForm
Prompt for Claude Code:
In src/web/src/pages/Products/ProductForm.tsx:

1. Add state:
   - showQrScanner: boolean
   - isLookingUpAslBelgisi: boolean
   - mcVerification: object | null

2. Add handler function handleQrScan(qrData: string) that:
   - Calls aslBelgisi.detectQrType(qrData)
   - If 'fiscal' → show warning toast, return
   - If 'datamatrix':
     a) Extract GTIN with aslBelgisi.extractGtinFromDataMatrix()
     b) Verify MC with aslBelgisi.verifyMarkingCode()
     c) Check valid statuses: ['INTRODUCED', 'APPLIED', 'IN_CIRCULATION']
     d) Search local DB with searchByBarcode(gtin)
     e) If not found, lookup in mxik.searchByBarcode(gtin)
     f) Auto-populate form with merged data
   - If 'mxik' → call mxik.lookupCode()
   - If 'barcode' → call handleBarcodeChange()

3. Add Camera button next to barcode input field
4. Add BarcodeScannerModal that calls handleQrScan on scan
   Reference implementation:
   typescriptconst [showQrScanner, setShowQrScanner] = useState(false);
   const [isLookingUpAslBelgisi, setIsLookingUpAslBelgisi] = useState(false);
   const [mcVerification, setMcVerification] = useState<any>(null);

const handleQrScan = async (qrData: string) => {
const qrType = aslBelgisi.detectQrType(qrData);

try {
if (qrType === 'fiscal') {
toast.warning(t("products.qrCodeIsFiscal"));
setShowQrScanner(false);
return;
}

    if (qrType === 'datamatrix') {
      const gtin = aslBelgisi.extractGtinFromDataMatrix(qrData);

      if (!gtin) {
        toast.error(t("products.invalidDataMatrix"));
        setShowQrScanner(false);
        return;
      }

      setIsLookingUpAslBelgisi(true);

      try {
        // Step 1: Verify marking code
        const mcVerif = await aslBelgisi.verifyMarkingCode(qrData);

        if (!mcVerif.isValid) {
          toast.error(t("products.invalidMarkingCode"));
          setShowQrScanner(false);
          return;
        }

        // Check MC status
        const validStatuses = ['INTRODUCED', 'APPLIED', 'IN_CIRCULATION'];
        if (mcVerif.status && !validStatuses.includes(mcVerif.status)) {
          toast.error(
            t("products.markingCodeNotValid", { status: mcVerif.status })
          );
          setShowQrScanner(false);
          return;
        }

        setMcVerification(mcVerif);
        toast.success(t("products.markingCodeVerified"));

        // Step 2: Check local DB
        const existing = await searchByBarcode(gtin);

        if (existing) {
          toast.info(t("products.productExists"));
          setFormData({ ...existing, barcode: gtin });
          setShowQrScanner(false);
          return;
        }

        // Step 3: Lookup in tasnif
        const tasnifData = await mxik.searchByBarcode(gtin);

        // Merge data
        setFormData(prev => ({
          ...prev,
          barcode: gtin,
          nameRu: tasnifData.nameRu,
          nameUz: tasnifData.name,
          mxik: tasnifData.code,
          packageCode: tasnifData.packageCode,
          productionDate: mcVerif.productionDate
            ? mcVerif.productionDate.split('T')[0]
            : prev.productionDate,
          expiryDate: mcVerif.expirationDate
            ? mcVerif.expirationDate.split('T')[0]
            : prev.expiryDate,
        }));

        toast.success(t("products.productDataImported", {
          source: "tasnif.soliq.uz + asl-belgisi"
        }));

      } catch (error) {
        setFormData(prev => ({ ...prev, barcode: gtin }));
        toast.warning(t("products.manualEntryRequired"));
      }

    } else if (qrType === 'mxik') {
      try {
        const mxikData = await mxik.lookupCode(qrData);
        setFormData(prev => ({
          ...prev,
          mxik: mxikData.code,
          packageCode: mxikData.packageCode,
        }));
        toast.success(t("products.mxikCodeScanned"));
      } catch {
        toast.error(t("products.mxikLookupFailed"));
      }
    } else {
      handleBarcodeChange(qrData);
    }

} finally {
setIsLookingUpAslBelgisi(false);
setShowQrScanner(false);
}
};
UI Integration:
tsx{/_ Barcode field with QR scanner _/}
<FormGroup>
<Label>
{t("products.barcode")} <Req>\*</Req>
</Label>

  <div style={{ display: "flex", gap: "8px" }}>
    <Input
      value={formData.barcode}
      onChange={(e) => handleBarcodeChange(e.target.value)}
      disabled={isEdit}
      required
      style={{ flex: 1 }}
    />
    {!isEdit && (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setShowQrScanner(true)}
        title={t("products.scanQrCode")}
        disabled={isLookingUpAslBelgisi}
      >
        {isLookingUpAslBelgisi ? (
          <RefreshCw size={20} className="spin" />
        ) : (
          <Camera size={20} />
        )}
      </Button>
    )}
  </div>
  {mcVerification?.isValid && (
    <div style={{
      marginTop: 8,
      padding: '8px 12px',
      background: '#4caf5010',
      border: '1px solid #4caf50',
      borderRadius: 4,
      fontSize: 12,
    }}>
      <span style={{ color: '#4caf50', fontWeight: 600 }}>
        ✓ {t("products.verifiedByAslBelgisi")}
      </span>
      {mcVerification.issuerName && (
        <div style={{ marginTop: 4, color: '#666' }}>
          {t("products.issuer")}: {mcVerification.issuerName}
        </div>
      )}
    </div>
  )}
</FormGroup>

{/_ QR Scanner Modal _/}
{showQrScanner && (
<BarcodeScannerModal
onScan={handleQrScan}
onClose={() => setShowQrScanner(false)}
/>
)}

Step 3 — Add Translation Keys
Prompt for Claude Code:
In src/web/src/i18n/locales/ru.json and uz.json, add these keys under "products":

- scanQrCode: "Scan QR / Barcode"
- qrCodeIsFiscal: "This is a fiscal receipt QR code"
- invalidDataMatrix: "Invalid DataMatrix QR code"
- invalidMarkingCode: "Invalid or unregistered marking code"
- markingCodeNotValid: "Marking code status: {{status}} - not valid for sale"
- markingCodeVerified: "Marking code verified by asl-belgisi"
- verifiedByAslBelgisi: "Verified marking code"
- issuer: "Manufacturer"
- productDataImported: "Product data imported from {{source}}"
- manualEntryRequired: "Product not found. Please enter details manually"
  Russian translations:
  json{
  "products": {
  "scanQrCode": "Сканировать QR / Штрихкод",
  "qrCodeIsFiscal": "Это QR-код фискального чека",
  "invalidDataMatrix": "Неверный QR-код DataMatrix",
  "invalidMarkingCode": "Недействительный или незарегистрированный код маркировки",
  "markingCodeNotValid": "Статус кода маркировки: {{status}} - недействителен для продажи",
  "markingCodeVerified": "Код маркировки проверен через asl-belgisi",
  "verifiedByAslBelgisi": "Код маркировки подтвержден",
  "issuer": "Производитель",
  "productDataImported": "Данные товара импортированы из {{source}}",
  "manualEntryRequired": "Товар не найден. Пожалуйста, введите данные вручную"
  }
  }
  Uzbek translations:
  json{
  "products": {
  "scanQrCode": "QR / Shtrix-kod skanerlash",
  "qrCodeIsFiscal": "Bu fiskal chek QR-kodi",
  "invalidDataMatrix": "Noto'g'ri DataMatrix QR-kodi",
  "invalidMarkingCode": "Yaroqsiz yoki ro'yxatdan o'tmagan markirovka kodi",
  "markingCodeNotValid": "Markirovka kodi holati: {{status}} - sotish uchun yaroqsiz",
  "markingCodeVerified": "Markirovka kodi asl-belgisi orqali tekshirildi",
  "verifiedByAslBelgisi": "Markirovka kodi tasdiqlandi",
  "issuer": "Ishlab chiqaruvchi",
  "productDataImported": "Mahsulot ma'lumotlari {{source}} dan import qilindi",
  "manualEntryRequired": "Mahsulot topilmadi. Iltimos, ma'lumotlarni qo'lda kiriting"
  }
  }

Step 4 — Understanding QR Code Types
Your POS will encounter 4 types of QR codes:
QR TypeFormatExampleDetectionActionFiscal ReceiptURLhttps://my.soliq.uz/...Contains http://IgnoreProduct DataMatrixGS1 format0148701234567892...Starts with 01 + 14 digitsExtract GTIN → Verify MC → LookupMXIK Code17-digit number06111001018000000/^\d{17}$/MXIK lookupRegular BarcodeEAN-13, etc.4870123456789OtherDatabase search
DataMatrix Structure:
01 4870123456789 21 ABC123 93 XYZ
│ │ │ │ │ │
│ └─ GTIN (14) │ │ │ └─ Verification code
│ │ └─ Serial number
└─ AI = GTIN └─ AI = Serial

Step 5 — MC Status Reference
When verifying a marking code, check these statuses:
StatusDescriptionCan Sell?EMITTEDCode issued but not applied❌ NoAPPLIEDCode applied to product✅ YesINTRODUCEDProduct introduced to circulation✅ YesIN_CIRCULATIONProduct being sold/moved✅ YesWITHDRAWNProduct recalled/withdrawn❌ NoRETIREDCode retired from system❌ NoDISAGGREGATEDRemoved from package⚠️ Check parent
Valid statuses for sale:
typescriptconst VALID_MC_STATUSES = [
'INTRODUCED',
'APPLIED',
'IN_CIRCULATION'
];

Quick Reference
ThingValueasl-belgisi base URLhttps://xtrace.aslbelgisi.uz/public/apiPublic MC endpoint/cod/public/codesAuth required?❌ No (for public endpoints)Geo-blocked?❌ No (works from Germany VPS)Call from client or server?🌐 Client (browser in UZ)tasnif.soliq.uzUse for product names/MXIKDataMatrix format01{GTIN(14)}21{serial}...Valid MC statusesINTRODUCED, APPLIED, IN_CIRCULATION

Common Claude Code Prompts

# Test the integration:

"Test the aslBelgisi.verifyMarkingCode function with this sample DataMatrix code:
0148701234567892ABC123. Show me the full response."

# Add error handling:

"Add a fallback in handleQrScan: if asl-belgisi verification fails (network error),
still allow product creation but show a warning toast that MC wasn't verified"

# Add logging:

"Add console.log statements in handleQrScan to debug the flow:

1. QR type detected
2. GTIN extracted
3. MC verification result
4. tasnif lookup result
5. Final form data"

# Store MC in database:

"Update Prisma schema to add optional field 'markingCode' to Product model,
then save the full DataMatrix code when creating product via QR scan"

Workflow Diagram
┌─────────────────────────────────────────────────────┐
│ User scans DataMatrix QR on product packaging │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ detectQrType(qrData) │
│ ├─ Fiscal → Show warning │
│ ├─ MXIK (17 digits) → MXIK lookup │
│ ├─ DataMatrix (01...) → Continue ✅ │
│ └─ Other → Treat as barcode │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ extractGtinFromDataMatrix(qrData) │
│ Returns: "4870123456789" (14 digits) │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ verifyMarkingCode(fullDataMatrix) │
│ POST /public/api/cod/public/codes │
│ Returns: │
│ ├─ status: "INTRODUCED" ✅ │
│ ├─ gtin: "4870123456789" │
│ ├─ productionDate: "2024-01-15" │
│ ├─ expirationDate: "2025-01-15" │
│ └─ issuerName: "ООО Молзавод" │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ Check status in VALID_MC_STATUSES │
│ If invalid → Show error, return ❌ │
│ If valid → Continue ✅ │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ searchByBarcode(gtin) │
│ Check local database │
│ ├─ Found → Load existing product ✅ │
│ └─ Not found → Continue │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ mxik.searchByBarcode(gtin) │
│ GET tasnif.soliq.uz │
│ Returns: │
│ ├─ nameRu: "Молоко пастеризованное" │
│ ├─ nameUz: "Pasterizatsiyalangan sut" │
│ ├─ code: "06111001018000000" │
│ └─ packageCode: "796" (piece) │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ Merge data from both sources │
│ ├─ barcode: from GTIN │
│ ├─ names: from tasnif │
│ ├─ mxik: from tasnif │
│ ├─ packageCode: from tasnif │
│ └─ dates: from asl-belgisi MC │
└─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ Auto-populate ProductForm │
│ Show success toast ✅ │
│ Display verification badge │
└─────────────────────────────────────────────────────┘

Troubleshooting
asl-belgisi returns { isValid: false }
→ Marking code not registered in system or incorrect format. Check that you're passing the full DataMatrix code, not just GTIN.
"Marking code status: EMITTED - not valid for sale"
→ Code issued but not yet applied to product. This is a manufacturer error - they need to report utilization first.
tasnif.soliq.uz returns empty results
→ Product not in MXIK registry. Fallback to manual entry. Some imported products may not be registered yet.
Network errors from client-side
→ User's browser might be blocking cross-origin requests. Check browser console for CORS errors. The APIs should allow CORS by default.
MC verification works but tasnif fails
→ Two separate systems - asl-belgisi tracks marking codes, tasnif tracks MXIK classifications. A product can have an MC but not be in MXIK registry yet (rare but possible for new products).
Multiple products returned from tasnif
→ The searchByBarcode function takes the first match. If GTIN matches multiple products, verify with user which is correct.

Testing Checklist

Scan fiscal receipt QR → Should show warning, not create product
Scan DataMatrix with valid status → Should auto-populate form
Scan DataMatrix with WITHDRAWN status → Should show error
Scan MXIK 17-digit QR → Should populate MXIK field only
Scan regular EAN-13 barcode → Should search database normally
Product exists in DB → Should load existing, not create duplicate
Network offline → Should gracefully fallback to manual entry
Invalid DataMatrix format → Should show error message

Next Steps
Once this integration is complete, you can:

Register for full API access (optional):

Get Business User account at https://xtrace.aslbelgisi.uz
Generate API key in Personal Account
Access full product registry (not just public MC info)

Store marking codes in sales:

Add markingCode field to SaleItem model
Include in OFD fiscal receipt payload
Enable product recall tracking

Batch product import:

Import entire catalog from asl-belgisi registry
Auto-sync product data changes
Monitor MC status for recalled products

Last Updated: January 2026
Status: Production Ready ✅
