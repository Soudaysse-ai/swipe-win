import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('admin_user')); } catch { return null; }
  });

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setToken(null);
    setAdmin(null);
  }, []);

  // Rafraîchit les permissions (un rôle peut avoir changé depuis la connexion).
  useEffect(() => {
    if (!token) return;
    api.get('/admin/me').then(({ data }) => {
      setAdmin(data.admin);
      localStorage.setItem('admin_user', JSON.stringify(data.admin));
    }).catch((err) => { if (err.response?.status === 401) logout(); });
  }, [token, logout]);

  async function login(email, password) {
    const { data } = await api.post('/admin/login', { email, password });
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_user', JSON.stringify(data.admin));
    setToken(data.token);
    setAdmin(data.admin);
  }

  // Affichage seulement : chaque permission est revérifiée par le serveur.
  const can = useCallback((perm) => !!admin?.permissions?.includes(perm), [admin]);

  return (
    <AdminAuthContext.Provider value={{ token, admin, login, logout, can }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
