import { NavLink, Link } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import YasLogo from './YasLogo';
import { useAuth } from '../player/AuthContext';
import { useSession } from '../player/SessionContext';
import { useConnectionStatus } from '../lib/socket';

const NAV = [
  { to: '/', label: 'Accueil', icon: 'home', end: true },
  { to: '/games', label: 'Jeux', icon: 'games' },
  { to: '/friends', label: 'Amis', icon: 'friends' },
  { to: '/rankings', label: 'Classements', icon: 'trophy' },
  { to: '/profile', label: 'Profil', icon: 'user' },
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
          <span className="pill"><Icon name={n.icon} size={22} /></span>
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function TopHeader() {
  const { user } = useAuth();
  const { unread } = useSession();
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="Défi Yas — accueil" style={{ textDecoration: 'none' }}>
        <YasLogo size={34} />
        <span>Défi</span>
      </Link>
      <div className="grow" />
      {user && (
        <Link to="/profile" className="row" style={{ gap: 8, textDecoration: 'none', minWidth: 0 }}>
          <div className="who" style={{ textAlign: 'right' }}>
            <b>{user.username}</b>
            <span>Niv. {user.progress?.level ?? 1}</span>
          </div>
          <Avatar id={user.avatar} size={38} />
        </Link>
      )}
      <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}>
        <Icon name="bell" />
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </Link>
    </header>
  );
}

export default function AppShell({ children, header = true, nav = true }) {
  return (
    <div className="app-frame">
      <ConnectionBanner />
      {header && <TopHeader />}
      <main className={`app-main${nav ? '' : ' no-nav'}`}>{children}</main>
      {nav && <BottomNav />}
    </div>
  );
}
