// Re-export all types except UserRole and PaymentMethod (defined in constants)
export type {
  Store,
  StoreSettings,
  StoreCreateInput,
  StoreUpdateInput,
  StoreWithStats,
  StoreSubscription,
  SubscriptionPaymentInfo,
  SubscriptionFailureReason,
} from './store.types';

export type {
  User,
  UserCreateInput,
  UserUpdateInput,
  UserLoginInput,
  AuthResponse,
  CurrentUser,
  AuthUser,
  UserListItem,
} from './user.types';

export type {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  Category,
  ProductUnit,
  ProductType,
  PreWeighedItem,
  ProductSearchQuery,
  LowStockProduct,
  StockAvailability,
  ExpiryStatus,
  PromotionStatus,
  ProductFilterParams,
} from './product.types';

export type {
  Supplier,
  SupplierTransaction,
  SupplierTransactionType,
  SupplierTransactionCreateType,
  SupplierPaymentMethod,
  SupplierProduct,
  SupplierCreateInput,
  SupplierUpdateInput,
  SupplierTransactionCreateInput,
  SupplierTransactionUpdateInput,
  SupplierTransactionFilters,
  SupplierWithTransactions,
  SupplierPaymentType,
  InventoryArrivalDescription,
} from './supplier.types';

export type {
  Sale,
  SaleItem,
  CartItem,
  SaleCreateInput,
  SaleItemInput,
  SaleSyncData,
  DailySummary,
} from './sale.types';

export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  PaginationQuery,
  SyncRequest,
  SyncResponse,
  HealthCheckResponse,
} from './api.types';

export type {
  ScannedReceiptItem,
  ScannedReceiptData,
  ProductMatch,
  ReceiptLineItem,
} from './receipt.types';

export type { Smena, SmenaMovement, SmenaStats } from './smena.types';

export type {
  Debtor,
  DebtTransaction,
  DebtTransactionType,
  DebtLedger,
  UnpaidCreditSale,
} from './debt.types';

export type { CatalogEntry, MxikGroup } from './mxik.types';

export type {
  FiscalState,
  RegosVcrConfig,
  RegosVcrConfigInput,
  FiscalConnectionResult,
  FiscalQueueStatus,
  FiscalBulkResult,
  FiscalBulkProgress,
  FiscalLabel,
  FiscalZReport,
  FiscalZReportStatus,
  FiscalActionResult,
  FiscalPhaseStats,
  FiscalSaleTiming,
  FiscalTimings,
} from './fiscal.types';

export type {
  LandingPlanId,
  LandingPlan,
  LandingPhone,
  LandingSocial,
  LandingContact,
} from './landing.types';

// Values, not types — the landing page and the dashboard both need the normalizers and the
// id/platform lists, so these are exported as runtime exports rather than `export type`.
export {
  LANDING_PLAN_IDS,
  KNOWN_SOCIAL_PLATFORMS,
  DEFAULT_LANDING_CONTACT,
  emptyLandingPlan,
  normalizeLandingPlans,
  normalizeLandingContact,
} from './landing.types';
