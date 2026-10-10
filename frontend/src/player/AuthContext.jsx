import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import playerApi, { TOKEN_KEY, getToken } from '../lib/playerApi';
import { connectSocket, disconnectSocket, onSocket } from '../lib/socket';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [authError, setAuthError] = useState(null);

  const saveToken = (t) => {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
    setToken(t);
  };

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    const { data } = await playerApi.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const clear = useCallback(() => {
    disconnectSocket();
    saveToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) { setLoading(false); return undefined; }
    connectSocket(token);
    setLoading(true);
    refresh().catch(() => {}).finally(() => setLoading(false));
    return undefined;
  }, [token, refresh]);

  useEffect(() => {
    const onUnauthorized = () => clear();
    window.addEventListener('dy:unauthorized', onUnauthorized);
    const off = onSocket('$auth_error', (code) => {
      setAuthError(code === 'SUSPENDED' ? 'Ton compte est suspendu.' : null);
      clear();
    });
    return () => { window.removeEventListener('dy:unauthorized', onUnauthorized); off(); };
  }, [clear]);

  async function login(phone, password) {
    const { data } = await playerApi.post('/auth/login', { phone, password });
    setAuthError(null);
    saveToken(data.token);
  }

  async function register(payload) {
    const { data } = await playerApi.post('/auth/register', payload);
    setAuthError(null);
    saveToken(data.token);
  }

  async function logout() {
    try { await playerApi.post('/auth/logout'); } catch { /* déjà déconnecté */ }
    clear();
  }

  return (
    <AuthCtx.Provider value={{ token, user, setUser, loading, login, register, logout, refresh, authError }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
