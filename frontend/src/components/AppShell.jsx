import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import YasLogo from './YasLogo';
import YasMark from './YasMark';
import { useAuth } from '../player/AuthContext';
import { useSession } from '../player/SessionContext';
import { useConnectionStatus } from '../lib/socket';

// Navigation principale : barre basse flottante (mobile / tablette) et barre
// latérale (ordinateur, ≥ 1024 px). Mêmes destinations, même ordre.
const NAV = [
  { to: '/', label: 'Accueil', icon: 'home', end: true },
  { to: '/games', label: 'Jeux', icon: 'games' },
  { to: '/rankings', label: 'Classement', icon: 'trophy' },
  { to: '/friends', label: 'Amis', icon: 'friends' },
  { to: '/profile', label: 'Profil', icon: 'user' },
];
const SIDE_EXTRA = [
  { to: '/tournaments', label: 'Tournois', icon: 'medal' },
  { to: '/quiz', label: 'Swipe & gagne', icon: 'ball' },
];

export function ConnectionBanner() {
  const s = useConnectionStatus();
  if (s.connected || !s.everConnected) return null;
  return <div className="conn-banner" role="status"><span>Connexion perdue — reconnexion en cours…</span></div>;
}

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={n.icon} size={22} />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function SideNav() {
  const { user } = useAuth();
  const item = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `item${isActive ? ' active' : ''}`}>
      <Icon name={n.icon} size={22} /><span>{n.label}</span>
    </NavLink>
  );
  return (
    <aside className="side-nav" aria-label="Navigation principale">
      <Link to="/" className="brand" aria-label="Défi Yas — accueil">
        <YasLogo size={52} />
        <span><b>Défi Yas</b><small>Jeux multijoueurs</small></span>
      </Link>
      <nav className="items">{NAV.map(item)}</nav>
      <div className="side-sep" />
      <nav className="items">{SIDE_EXTRA.map(item)}</nav>
      <Link to="/games" className="side-cta">
        <b>Prêt pour un défi ?</b>
        <span>Lance une partie en quelques secondes.</span>
        <span className="btn sm">Jouer <span className="arrow" /></span>
      </Link>
      {user && (
        <Link to="/profile" className="side-me">
          <Avatar id={user.avatar} size={40} />
          <span className="grow"><b>{user.username}</b><small>Niveau {user.progress?.level ?? 1}</small></span>
          <Icon name="chevron" size={18} />
        </Link>
      )}
    </aside>
  );
}

// Menu hamburger (mobile / tablette) : contenus et actions secondaires,
// logo calé en haut à gauche sur fond Sunshine Yellow.
const MENU = [
  { to: '/tournaments', label: 'Tournois', icon: 'medal' },
  { to: '/quiz', label: 'Swipe & gagne', icon: 'ball' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/games', label: 'Règles des jeux', icon: 'help' },
  { to: '/terms', label: "Conditions d'utilisation", icon: 'lock' },
];

function MenuDrawer({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <nav className="drawer" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-top">
          <Link to="/" className="brand" onClick={onClose} aria-label="Défi Yas — accueil"><YasLogo size={48} /><b>Défi Yas</b></Link>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer le menu"><Icon name="close" /></button>
        </div>
        {user && (
          <Link to="/profile" className="drawer-me" onClick={onClose}>
            <Avatar id={user.avatar} size={48} />
            <span className="grow"><b>{user.username}</b><small>Niveau {user.progress?.level ?? 1}</small></span>
            <Icon name="chevron" size={18} />
          </Link>
        )}
        <div className="drawer-items">
          {MENU.map(m => (
            <Link key={m.to + m.label} to={m.to} onClick={onClose}><Icon name={m.icon} size={22} /><span>{m.label}</span></Link>
          ))}
        </div>
        <button className="btn outline drawer-logout" onClick={async () => { onClose(); await logout(); navigate('/welcome'); }}>
          <Icon name="logout" size={18} /> Se déconnecter
        </button>
      </nav>
    </div>
  );
}

// Barre de navigation de l'application (guide §3.1) : toujours Sunshine Yellow,
// marque « y! » Midnight Blue calée à gauche, au plus 3 icônes + menu à droite.
export function TopHeader() {
  const { user } = useAuth();
  const { unread } = useSession();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [pathname]);
  return (
    <header className="app-header">
      <Link to="/" className="header-mark" aria-label="Défi Yas — accueil"><YasMark height={30} /></Link>
      <span className="grow" />
      <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}>
        <Icon name="bell" />
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </Link>
      {user && <Link to="/profile" className="header-avatar" aria-label="Mon profil"><Avatar id={user.avatar} size={40} /></Link>}
      <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Ouvrir le menu" aria-expanded={menu}><Icon name="menu" /></button>
      <MenuDrawer open={menu} onClose={() => setMenu(false)} />
    </header>
  );
}

// nav=false : écran de partie, plein écran sans navigation.
export default function AppShell({ children, header = true, nav = true }) {
  return (
    <div className={`app-frame${nav ? ' with-nav' : ''}`}>
      <ConnectionBanner />
      {nav && <SideNav />}
      <div className={`app-content${header ? ' has-header' : ''}`}>
        {header && <TopHeader />}
        <main className={`app-main${nav ? '' : ' no-nav'}`}>{children}</main>
      </div>
      {nav && <BottomNav />}
    </div>
  );
}
