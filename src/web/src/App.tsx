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

function PrivateRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user, sessionRestored } = useAuthStore();

  if (!sessionRestored) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'ADMIN') return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function App() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <BrowserRouter>
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
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
