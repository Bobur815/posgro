import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { ProtectedRoute } from "./components/protected/ProtectedRoute";
import { RoleGuard } from "./components/protected/RoleGuard";
import { useAuthStore } from "./store/auth-store";

// Pages
import { PinLoginPage } from "./pages/Login/PinLoginPage";
import { POSScreen } from "./pages/POS/POSScreen";
import { ProductList } from "./pages/Products/ProductList";
import { ProductForm } from "./pages/Products/ProductForm";
import { ProductDetails } from "./pages/Products/ProductDetails";
import { StockManagement } from "./pages/Products/StockManagement";
import { DailySummary } from "./pages/Reports/DailySummary";
import { MonthlyReport } from "./pages/Reports/MonthlyReport";
import { Analytics } from "./pages/Reports/Analytics";
import { SettingsPage } from "./pages/Settings/SettingsPage";
import { UserSettings } from "./pages/Settings/UserSettings";
import { SystemSettings } from "./pages/Settings/SystemSettings";
import { PriceTags } from "./pages/Settings/PriceTags";
import { UserList } from "./pages/Users/UserList";
import { UserForm } from "./pages/Users/UserForm";
import { SupplierList, SupplierForm, SupplierDetails } from "./pages/Suppliers";

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* Public routes - Login */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <PinLoginPage />
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Default route - POS Screen */}
        <Route index element={<POSScreen />} />

        {/* Products */}
        <Route path="products" element={<ProductList />} />
        <Route
          path="products/new"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <ProductForm />
            </RoleGuard>
          }
        />

        <Route
          path="products/:id"
          element={
            <RoleGuard allowedRoles={["ADMIN", "USER"]}>
              <ProductDetails />
            </RoleGuard>
          }
        />

        <Route
          path="products/:id/edit"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <ProductForm />
            </RoleGuard>
          }
        />
        <Route
          path="products/stock"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <StockManagement />
            </RoleGuard>
          }
        />

        {/* Reports */}
        <Route path="reports/daily" element={<DailySummary />} />
        <Route
          path="reports/monthly"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <MonthlyReport />
            </RoleGuard>
          }
        />
        <Route
          path="reports/analytics"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <Analytics />
            </RoleGuard>
          }
        />

        {/* Settings */}
        <Route
          path="settings"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SettingsPage />
            </RoleGuard>
          }
        />
        <Route path="settings/user" element={<UserSettings />} />
        <Route
          path="settings/system"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SystemSettings />
            </RoleGuard>
          }
        />
        <Route
          path="settings/price-tags"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <PriceTags />
            </RoleGuard>
          }
        />

        {/* User Management (Admin only) */}
        <Route
          path="users"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <UserList />
            </RoleGuard>
          }
        />
        <Route
          path="users/new"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <UserForm />
            </RoleGuard>
          }
        />
        <Route
          path="users/:id/edit"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <UserForm />
            </RoleGuard>
          }
        />

        {/* Supplier Management (Admin only) */}
        <Route
          path="suppliers"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SupplierList />
            </RoleGuard>
          }
        />
        <Route
          path="suppliers/new"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SupplierForm />
            </RoleGuard>
          }
        />
        <Route
          path="suppliers/:id"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SupplierDetails />
            </RoleGuard>
          }
        />
        <Route
          path="suppliers/:id/edit"
          element={
            <RoleGuard allowedRoles={["ADMIN"]}>
              <SupplierForm />
            </RoleGuard>
          }
        />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
