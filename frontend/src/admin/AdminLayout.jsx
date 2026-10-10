import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import YasLogo from '../components/YasLogo';
import Icon from '../components/Icon';
import '../styles/admin.css';

const NAV = [
  { group: 'Pilotage' },
  { to: '/admin', label: 'Dashboard', perm: 'dashboard.view', end: true },
  { to: '/admin/live', label: 'Activité en direct', perm: 'dashboard.view' },
  { to: '/admin/engagement', label: 'Engagement', perm: 'analytics.view' },
  { group: 'Jeux' },
  { to: '/admin/games/cards', label: 'Yas Cards', perm: 'analytics.view' },
  { to: '/admin/games/connect', label: 'Yas Connect', perm: 'analytics.view' },
  { to: '/admin/games/penalty', label: 'Yas Penalty', perm: 'analytics.view' },
  { to: '/admin/games/ludo', label: 'Yas Ludo', perm: 'analytics.view' },
  { group: 'Joueurs' },
  { to: '/admin/top', label: 'Meilleurs joueurs', perm: 'players.view' },
  { to: '/admin/users', label: 'Utilisateurs', perm: 'players.view' },
  { to: '/admin/leaderboards', label: 'Classements & saisons', perm: 'leaderboards.view' },
  { to: '/admin/review', label: 'Résultats suspects', perm: 'matches.review' },
  { to: '/admin/moderation', label: 'Modération', perm: 'reports.manage' },
  { group: 'Compétitions' },
  { to: '/admin/tournaments', label: 'Tournois', perm: 'tournaments.manage' },
  { group: 'Configuration' },
  { to: '/admin/settings', label: 'Réglages des jeux', perm: 'games.manage' },
  { to: '/admin/admins', label: 'Administrateurs', perm: 'admins.manage' },
  { to: '/admin/audit', label: 'Journal d\'audit', perm: 'audit.view' },
  { group: 'Swipe & Win (quiz)' },
  { to: '/admin/quiz', label: 'Tableau de bord quiz', perm: 'dashboard.view', end: true },
  { to: '/admin/quiz/questions', label: 'Questions', perm: 'quiz.manage' },
  { to: '/admin/quiz/themes', label: 'Thèmes', perm: 'quiz.manage' },
  { to: '/admin/quiz/prizes', label: 'Lots', perm: 'quiz.manage' },
  { to: '/admin/quiz/leaderboard/score', label: 'Classement quiz', perm: 'leaderboards.view' },
  { to: '/admin/quiz/players', label: 'Joueurs du quiz', perm: 'players.view' },
];

const ROLE_LABEL = {
  super_admin: 'Super Admin', platform_admin: 'Platform Admin', game_manager: 'Game Manager',
  marketing_manager: 'Marketing Manager', data_analyst: 'Data Analyst', moderator: 'Moderator',
};

export default function AdminLayout() {
  const { admin, logout, can } = useAdminAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // On masque les groupes vides selon les permissions du rôle.
  const items = NAV.filter(n => n.group || can(n.perm));
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));

  return (
    <div className="adm">
      <div className="adm-top">
        <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open}><Icon name={open ? 'close' : 'games'} /></button>
        <b style={{ fontStyle: 'italic' }}>Centre de contrôle Yas</b>
      </div>
      <aside className={`adm-side${open ? ' open' : ''}`}>
        <div className="adm-brand"><YasLogo size={36} /><div>Défi Yas<small>Centre de contrôle</small></div></div>
        <nav className="adm-nav" aria-label="Back-office">
          {visible.map((n, i) => n.group
            ? <div key={`g${i}`} className="grp">{n.group}</div>
            : <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>)}
        </nav>
        <div className="adm-foot">
          <div className="bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{admin?.email}</div>
          <div style={{ color: 'var(--yas-yellow)', marginBottom: 8 }}>{ROLE_LABEL[admin?.role] || admin?.role}</div>
          <button className="btn sm outline-light" onClick={() => { logout(); navigate('/admin/login'); }}>Déconnexion</button>
        </div>
      </aside>
      <main className="adm-main"><Suspense fallback={<div className="page-loading"><div className="spinner" /></div>}><Outlet /></Suspense></main>
    </div>
  );
}

export { ROLE_LABEL };
