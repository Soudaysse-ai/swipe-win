import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import YasLogo from '../../components/YasLogo';

const navItems = [
  { to: '/admin', label: '📊 Dashboard', end: true },
  { to: '/admin/leaderboard/score', label: '🏆 Score' },
  { to: '/admin/leaderboard/speed', label: '⚡ Rapidité' },
  { to: '/admin/prizes', label: '🎁 Lots' },
  { to: '/admin/questions', label: '❓ Questions' },
  { to: '/admin/players', label: '👥 Joueurs' },
];

export default function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <YasLogo size={44} />
          <div>
            <div style={styles.brandTitle}>SWIPE & WIN</div>
            <div style={styles.brandSub}>Admin</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={styles.sidebarBottom}>
          <div style={styles.adminInfo}>
            <div style={styles.adminEmail}>{admin?.email}</div>
            <div style={styles.adminRole}>{admin?.role}</div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: '#F0F4FF',
  },
  sidebar: {
    width: 220,
    background: '#00377D',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    position: 'sticky',
    top: 0,
    height: '100vh',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  brandTitle: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 18,
    color: '#FFD100',
    letterSpacing: 2,
    lineHeight: 1,
  },
  brandSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600 },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 12px',
    gap: 4,
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.75)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    transition: 'background 0.15s, color 0.15s',
  },
  navItemActive: {
    background: '#FFD100',
    color: '#00377D',
  },
  sidebarBottom: {
    padding: '16px 20px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  adminInfo: { marginBottom: 10 },
  adminEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600 },
  adminRole: {
    color: '#FFD100',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    padding: '32px 28px',
    overflowY: 'auto',
    maxWidth: '100%',
  },
};
