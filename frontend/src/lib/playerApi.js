import axios from 'axios';

export const TOKEN_KEY = 'dy_token';
export const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

const playerApi = axios.create({ baseURL: `${API_BASE}/api`, timeout: 15000 });

playerApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

playerApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && getToken()) window.dispatchEvent(new Event('dy:unauthorized'));
    return Promise.reject(err);
  },
);

// Message d'erreur lisible pour l'utilisateur.
export function apiError(err, fallback = 'Erreur réseau, réessaie.') {
  return err?.response?.data?.error || err?.message || fallback;
}

export default playerApi;
