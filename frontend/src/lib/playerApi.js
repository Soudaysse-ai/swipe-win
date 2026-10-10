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
  (res) => {
    // Une page HTML à la place du JSON = l'appel n'a pas atteint l'API.
    if (typeof res.data === 'string' && res.data.trimStart().startsWith('<')) {
      return Promise.reject(Object.assign(new Error('NOT_API'), { response: res }));
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401 && getToken()) window.dispatchEvent(new Event('dy:unauthorized'));
    return Promise.reject(err);
  },
);

// Message d'erreur lisible pour l'utilisateur.
export function apiError(err, fallback = 'Une erreur est survenue, réessaie.') {
  const res = err?.response;
  if (res?.data?.error) return res.data.error;
  if (!res) {
    // Pas de réponse : réseau coupé, serveur injoignable ou origine refusée (CORS).
    if (import.meta.env.DEV || !navigator.onLine) console.warn('API injoignable', API_BASE || '(même origine)', err?.message);
    return navigator.onLine
      ? 'Impossible de joindre le serveur Défi Yas. Réessaie dans un instant.'
      : 'Pas de connexion internet. Vérifie ton réseau et réessaie.';
  }
  if (typeof res.data === 'string' && res.data.trimStart().startsWith('<')) {
    // Réponse HTML : l'application ne parle pas à l'API (VITE_API_URL absente ou erronée).
    console.warn('Réponse non-API reçue de', res.config?.baseURL);
    return 'Le serveur Défi Yas est mal configuré (API introuvable).';
  }
  if (res.status === 429) return 'Trop de tentatives, patiente une minute.';
  return fallback;
}

export default playerApi;
