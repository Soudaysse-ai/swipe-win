import { NavLink, Link, useLocation } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import YasLogo from './YasLogo';
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
        <YasLogo size={56} />
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

export function TopHeader() {
  const { user } = useAuth();
  const { unread } = useSession();
  const { pathname } = useLocation();
  const home = pathname === '/';
  return (
    <header className="app-header">
      <Link to="/" className="brand-mobile" aria-label="Défi Yas — accueil"><YasLogo size={44} /></Link>
      <div className="greeting">
        {home && user && <>Salut, <span>{user.username}</span> <span aria-hidden>👋</span></>}
      </div>
      <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}>
        <Icon name="bell" />
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </Link>
      {user && <Link to="/profile" className="header-avatar" aria-label="Mon profil"><Avatar id={user.avatar} size={40} /></Link>}
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
