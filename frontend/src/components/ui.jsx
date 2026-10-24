import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { serverNow } from '../lib/socket';

export function Spinner({ center = false }) {
  const s = <div className="spinner" role="status" aria-label="Chargement" />;
  return center ? <div className="page-loading">{s}</div> : s;
}

// Barre d'écran secondaire (comme l'appli Yas) : Sunshine Yellow, retour + titre.
export function BackHeader({ title, to, right }) {
  const navigate = useNavigate();
  return (
    <header className="back-header">
      <button className="icon-btn" onClick={() => (to ? navigate(to) : navigate(-1))} aria-label="Retour">
        <Icon name="back" />
      </button>
      <h1>{title}</h1>
      {right}
    </header>
  );
}

// Titre de section façon appli Yas : libellé Midnight Blue 70 + lien « Voir tout › ».
export function SectionHead({ children, to, link, state }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {to && <Link to={to} state={state} className="link">{link}</Link>}
    </div>
  );
}

export function Sheet({ open, onClose, children, center = false, label }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Rendue au niveau de la page : à l'intérieur d'une zone qui défile (la scène d'un
  // jeu), Safari sur iPhone découpait la feuille (choix de couleur coupé par le chat).
  return createPortal(
    <div className={`sheet-backdrop${center ? ' center' : ''}`} onClick={onClose} role="presentation">
      <div className={`sheet${center ? ' center' : ''}`} role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}>
        {!center && <div className="grabber" />}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function LevelBar({ progress, onBlue = false }) {
  if (!progress) return null;
  const pct = Math.max(0, Math.min(1, progress.progress || 0)) * 100;
  return (
    <div className={onBlue ? 'on-blue' : ''}>
      <div className="row between tiny" style={{ marginBottom: 6 }}>
        <span>Niveau {progress.level}</span>
        <span>{progress.xp - progress.levelStartXp} / {progress.nextLevelXp - progress.levelStartXp} XP</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label={`Progression vers le niveau ${progress.level + 1}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const LEAGUE_STYLE = {
  Bronze: { bg: '#E8D2BC', fg: '#6B4423', icon: '🥉' },
  Silver: { bg: '#E7E7E8', fg: '#3E3E40', icon: '🥈' },
  Gold: { bg: '#FFF1B4', fg: '#00377D', icon: '🥇' },
  Platinum: { bg: '#DFEBF6', fg: '#00377D', icon: '💠' },
  Diamond: { bg: '#C7DBEF', fg: '#00377D', icon: '💎' },
  Legend: { bg: '#00377D', fg: '#FFD100', icon: '👑' },
};

export function LeagueBadge({ league }) {
  const s = LEAGUE_STYLE[league] || LEAGUE_STYLE.Bronze;
  return <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.icon} {league}</span>;
}

// Barre de temps calée sur l'horloge du serveur.
export function TimerBar({ deadline, total, label = true }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setTick(n => n + 1), 200);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  // Heure lue à chaque rendu (une heure vieille de 200 ms affichait « 31 s » sur un tour de 30 s).
  const left = Math.max(0, deadline - serverNow());
  const ratio = Math.min(1, left / total);
  return (
    <div className="row" style={{ gap: 8 }}>
      <div className={`timer grow${ratio < 0.3 ? ' low' : ''}`}><i style={{ transform: `scaleX(${ratio})` }} /></div>
      {label && <span className="tiny bold" style={{ width: 30, textAlign: 'right' }} aria-live="off">{Math.ceil(left / 1000)} s</span>}
    </div>
  );
}

export function Countdown({ until }) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.ceil((until - now) / 1000))}</>;
}

export function Empty({ icon = '🎮', children }) {
  return <div className="empty"><div className="big" aria-hidden>{icon}</div>{children}</div>;
}

export function Confetti() {
  const colors = ['#FFD100', '#5F99D2', '#00377D', '#3CB167', '#BC4F90'];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`, background: colors[i % colors.length],
          animationDuration: `${1.8 + (i % 5) * 0.35}s`, animationDelay: `${(i % 7) * 0.08}s`,
        }} />
      ))}
    </div>
  );
}
