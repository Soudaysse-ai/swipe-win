import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useIsMobile } from '../../hooks/useMediaQuery';
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
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  // ----- Vue mobile : barre du haut + tiroir déroulant -----
  if (isMobile) {
    return (
      <div style={styles.shellMobile}>
        <header style={styles.topbar}>
          <div style={styles.brandMobile}>
            <YasLogo size={32} />
            <div style={styles.brandTitleMobile}>SWIPE &amp; WIN</div>
          </div>
          <button
            style={styles.burger}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </header>

        {menuOpen && (
          <nav style={styles.drawer}>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                style={({ isActive }) => ({
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                })}
              >
                {item.label}
              </NavLink>
            ))}
            <div style={styles.drawerBottom}>
              <div style={styles.adminEmail}>{admin?.email}</div>
              <button style={styles.logoutBtn} onClick={handleLogout}>Déconnexion</button>
            </div>
          </nav>
        )}

        <main style={styles.mainMobile}>
          <Outlet />
        </main>
      </div>
    );
  }

  // ----- Vue bureau : sidebar fixe -----
  return (
    <div style={styles.shell}>
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
  shellMobile: {
    display: 'flex',
    flexDirection: 'column',
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
  // --- mobile topbar ---
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#00377D',
    padding: '12px 16px',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  brandMobile: { display: 'flex', alignItems: 'center', gap: 10 },
  brandTitleMobile: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 17,
    color: '#FFD100',
    letterSpacing: 1.5,
  },
  burger: {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#FFD100',
    fontSize: 20,
    cursor: 'pointer',
    flexShrink: 0,
  },
  drawer: {
    background: '#00377D',
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 12px 16px',
    gap: 4,
    position: 'sticky',
    top: 68,
    zIndex: 49,
    boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
  },
  drawerBottom: {
    marginTop: 8,
    paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
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
    padding: '12px 14px',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.75)',
    textDecoration: 'none',
    fontSize: 15,
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
    padding: '12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    padding: '32px 28px',
    overflowY: 'auto',
    maxWidth: '100%',
    minWidth: 0,
  },
  mainMobile: {
    flex: 1,
    padding: '18px 16px 32px',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'hidden',
  },
};
