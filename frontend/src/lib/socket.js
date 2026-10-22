// Client temps réel unique. Les composants s'abonnent à un bus interne, ce qui
// les rend indépendants des reconnexions (la socket peut être recréée).
import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from './playerApi';

let socket = null;
let currentToken = null;
let pingTimer = null;
const bus = new Map(); // event -> Set<fn>
const status = { connected: false, everConnected: false, error: null };
export const clock = { offset: 0, synced: false }; // offset : serverNow - Date.now()

function dispatch(event, payload) {
  const set = bus.get(event);
  if (set) for (const fn of [...set]) fn(payload);
}

function setStatus(patch) {
  Object.assign(status, patch);
  dispatch('$status', { ...status });
}

export function onSocket(event, fn) {
  if (!bus.has(event)) bus.set(event, new Set());
  bus.get(event).add(fn);
  return () => bus.get(event)?.delete(fn);
}

export function connectSocket(token) {
  if (socket && currentToken === token) return socket;
  disconnectSocket();
  currentToken = token;
  socket = io(API_BASE || undefined, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socket.on('connect', () => {
    setStatus({ connected: true, everConnected: true, error: null });
    ping();
  });
  socket.on('disconnect', () => setStatus({ connected: false }));
  socket.on('connect_error', (err) => {
    setStatus({ connected: false, error: err.message });
    if (err.message === 'UNAUTHORIZED' || err.message === 'SUSPENDED') {
      dispatch('$auth_error', err.message);
      socket.disconnect();
    }
  });
  socket.onAny((event, payload) => {
    // Un message met du temps à arriver : cette mesure retarde toujours l'heure du
    // serveur (d'où des « 31 s » sur un tour de 30 s). Elle ne sert qu'avant la
    // première mesure aller-retour (ping), ou si elle montre le serveur plus en avance.
    if (payload && typeof payload.serverNow === 'number') {
      const sample = payload.serverNow - Date.now();
      if (!clock.synced || sample > clock.offset) clock.offset = sample;
    }
    dispatch(event, payload);
  });
  pingTimer = setInterval(ping, 20000);
  return socket;
}

function ping() {
  if (!socket?.connected) return;
  const sentAt = Date.now();
  socket.timeout(5000).emit('ping', { sentAt }, (err, res) => {
    if (!err && res?.serverNow) { clock.offset = res.serverNow - (sentAt + Date.now()) / 2; clock.synced = true; }
  });
}

export function disconnectSocket() {
  clearInterval(pingTimer);
  if (socket) { socket.removeAllListeners(); socket.disconnect(); }
  socket = null;
  currentToken = null;
  setStatus({ connected: false });
}

// Envoie un événement et attend l'accusé de réception du serveur.
export function emit(event, payload = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(Object.assign(new Error('Non connecté'), { code: 'OFFLINE' }));
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) return reject(Object.assign(new Error('Le serveur ne répond pas, réessaie.'), { code: 'TIMEOUT' }));
      if (!res?.ok) return reject(Object.assign(new Error(res?.message || 'Action refusée'), { code: res?.code }));
      resolve(res);
    });
  });
}

export function newCommandId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const serverNow = () => Date.now() + clock.offset;

// Hook : s'abonne à un événement pour la durée de vie du composant.
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onSocket(event, (p) => ref.current(p)), [event]);
}

export function useConnectionStatus() {
  const [s, setS] = useState({ ...status });
  useEffect(() => onSocket('$status', setS), []);
  return s;
}
