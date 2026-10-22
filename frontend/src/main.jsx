import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { keepFresh } from './lib/freshness';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA facultative : le service worker n'est enregistré qu'en production.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
if (import.meta.env.PROD) keepFresh();
