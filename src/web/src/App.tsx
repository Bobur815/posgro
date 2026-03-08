import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth-store';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/Login/LoginPage';
import { ProductList } from './pages/Products/ProductList';
import { ProductForm } from './pages/Products/ProductForm';
import { ProductDetails } from './pages/Products/ProductDetails';
import { StockManagement } from './pages/Products/StockManagement';
import { SupplierList } from './pages/Suppliers/SupplierList';
import { SupplierForm } from './pages/Suppliers/SupplierForm';
import { SupplierDetails } from './pages/Suppliers/SupplierDetails';
import { DailySummary } from './pages/Reports/DailySummary';
import { MonthlyReport } from './pages/Reports/MonthlyReport';
import { Analytics } from './pages/Reports/Analytics';
import { UserList } from './pages/Users/UserList';
import { UserForm } from './pages/Users/UserForm';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { SystemSettings } from './pages/Settings/SystemSettings';
import { UserSettings } from './pages/Settings/UserSettings';
import { StoreList } from './pages/Admin/StoreList';

function PrivateRoute({
  children,
  adminOnly = false,
  superAdminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}) {
  const { isAuthenticated, user, sessionRestored } = useAuthStore();

  if (!sessionRestored) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (superAdminOnly && user?.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  if (adminOnly && user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function App() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const basename = import.meta.env.PROD ? '/web' : '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/products" replace />} />

          {/* Products */}
          <Route path="products" element={<ProductList />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/stock" element={<StockManagement />} />
          <Route path="products/:id" element={<ProductDetails />} />
          <Route path="products/:id/edit" element={<ProductForm />} />

          {/* Suppliers */}
          <Route path="suppliers" element={<SupplierList />} />
          <Route path="suppliers/new" element={<SupplierForm />} />
          <Route path="suppliers/:id" element={<SupplierDetails />} />
          <Route path="suppliers/:id/edit" element={<SupplierForm />} />

          {/* Reports */}
          <Route path="reports/daily" element={<DailySummary />} />
          <Route path="reports/monthly" element={<MonthlyReport />} />
          <Route path="reports/analytics" element={<Analytics />} />

          {/* Users (admin only) */}
          <Route path="users" element={<PrivateRoute adminOnly><UserList /></PrivateRoute>} />
          <Route path="users/new" element={<PrivateRoute adminOnly><UserForm /></PrivateRoute>} />
          <Route path="users/:id/edit" element={<PrivateRoute adminOnly><UserForm /></PrivateRoute>} />

          {/* Settings */}
          <Route path="settings" element={<PrivateRoute adminOnly><SettingsPage /></PrivateRoute>} />
          <Route path="settings/system" element={<PrivateRoute adminOnly><SystemSettings /></PrivateRoute>} />
          <Route path="settings/user" element={<UserSettings />} />

          {/* Super Admin */}
          <Route path="admin/stores" element={<PrivateRoute superAdminOnly><StoreList /></PrivateRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
