import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/protected/ProtectedRoute';
import { RoleGuard } from './components/protected/RoleGuard';
import { useAuthStore } from './store/auth-store';

// Pages
import { LoginPage } from './pages/Login/LoginPage';
import { POSScreen } from './pages/POS/POSScreen';
import { ProductList } from './pages/Products/ProductList';
import { ProductForm } from './pages/Products/ProductForm';
import { StockManagement } from './pages/Products/StockManagement';
import { DailySummary } from './pages/Reports/DailySummary';
import { MonthlyReport } from './pages/Reports/MonthlyReport';
import { Analytics } from './pages/Reports/Analytics';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { UserSettings } from './pages/Settings/UserSettings';
import { SystemSettings } from './pages/Settings/SystemSettings';
import { UserList } from './pages/Users/UserList';
import { UserForm } from './pages/Users/UserForm';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
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
            <RoleGuard allowedRoles={['ADMIN']}>
              <ProductForm />
            </RoleGuard>
          }
        />
        <Route
          path="products/:id/edit"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <ProductForm />
            </RoleGuard>
          }
        />
        <Route
          path="products/stock"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <StockManagement />
            </RoleGuard>
          }
        />

        {/* Reports */}
        <Route path="reports/daily" element={<DailySummary />} />
        <Route
          path="reports/monthly"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <MonthlyReport />
            </RoleGuard>
          }
        />
        <Route
          path="reports/analytics"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <Analytics />
            </RoleGuard>
          }
        />

        {/* Settings */}
        <Route
          path="settings"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <SettingsPage />
            </RoleGuard>
          }
        />
        <Route path="settings/user" element={<UserSettings />} />
        <Route
          path="settings/system"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <SystemSettings />
            </RoleGuard>
          }
        />

        {/* User Management (Admin only) */}
        <Route
          path="users"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <UserList />
            </RoleGuard>
          }
        />
        <Route
          path="users/new"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <UserForm />
            </RoleGuard>
          }
        />
        <Route
          path="users/:id/edit"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <UserForm />
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
