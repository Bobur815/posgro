import { useAuthStore } from '../store/auth-store';

export function useAuth() {
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    isAdmin: user?.role === 'ADMIN',
  };
}
