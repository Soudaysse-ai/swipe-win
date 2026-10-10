// Client HTTP du back-office (jeton administrateur).
import axios from 'axios';

const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;
const api = axios.create({ baseURL: BASE, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Téléchargement d'un export (CSV / Excel) avec le jeton administrateur.
export async function downloadExport(path, params = {}, format = 'csv') {
  const res = await api.get(path, { params: { ...params, format }, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || `export.${format}`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function adminError(err) {
  return err?.response?.data?.error || err?.message || 'Erreur';
}

export default api;
