import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import Avatar, { AVATAR_IDS } from '../../components/Avatar';
import Icon from '../../components/Icon';
import { Spinner, LevelBar, LeagueBadge, Sheet } from '../../components/ui';
import { GameStatsCard, MatchHistory } from './Social';
import { formatDuration, GAME_META } from '../../lib/format';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [matches, setMatches] = useState(null);
  const [historyGame, setHistoryGame] = useState('');
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => { playerApi.get('/players/me').then(r => setUser(r.data.player)).catch(() => {}); }, [setUser]);
  useEffect(() => {
    setMatches(null);
    playerApi.get('/players/me/matches', { params: { gameId: historyGame || undefined, limit: 20 } }).then(r => setMatches(r.data.matches)).catch(() => setMatches([]));
  }, [historyGame]);

  if (!user?.progress) return <Spinner center />;
  const p = user.progress;

  function openEdit() {
    setForm({ avatar: user.avatar, username: user.username, bio: user.bio || '', showStats: user.settings.showStats, allowInvites: user.settings.allowInvites });
    setEdit(true);
  }
  async function save() {
    try {
      const { data } = await playerApi.patch('/players/me', form);
      setUser(data.player);
      setEdit(false);
      toast('Profil mis à jour', { icon: '✅' });
    } catch (err) { toast(apiError(err)); }
  }

  return (
    <div className="stack">
      <div className="card blue on-blue stack">
        <div className="row">
          <Avatar id={user.avatar} size={72} />
          <div className="grow">
            <div className="h2" style={{ color: '#fff' }}>{user.username}</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <LeagueBadge league={p.league} />
              <span className="chip yellow">Niveau {p.level}</span>
            </div>
          </div>
          <button className="icon-btn" style={{ color: '#fff' }} onClick={openEdit} aria-label="Modifier mon profil"><Icon name="settings" /></button>
        </div>
        {user.bio && <p className="small">{user.bio}</p>}
        <LevelBar progress={p} onBlue />
      </div>

      <div className="stat-grid">
        <div className="stat"><b>{p.globalRank ? `#${p.globalRank}` : '—'}</b><span>Rang global</span></div>
        <div className="stat"><b>{p.seasonPoints}</b><span>Pts saison</span></div>
        <div className="stat"><b>{p.xp}</b><span>XP total</span></div>
        <div className="stat"><b>{p.matches}</b><span>Parties</span></div>
        <div className="stat"><b>{p.wins}</b><span>Victoires</span></div>
        <div className="stat"><b>{formatDuration(p.playTimeMs)}</b><span>Temps de jeu</span></div>
      </div>

      <div className="section-title"><h2>Mes <span className="accent">jeux</span></h2></div>
      {user.games.map(g => <GameStatsCard key={g.gameId} g={g} />)}

      <div className="section-title"><h2>Badges</h2><span className="small muted">{user.badges.filter(b => b.earned).length}/{user.badges.length}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {user.badges.map(b => (
          <div key={b.id} className="card tight center" style={{ opacity: b.earned ? 1 : 0.45, padding: 10 }} title={b.description}>
            <div style={{ fontSize: 28, filter: b.earned ? 'none' : 'grayscale(1)' }} aria-hidden>{b.icon}</div>
            <div className="tiny bold">{b.name}</div>
            <div className="tiny muted" style={{ fontSize: 11 }}>{b.description}</div>
          </div>
        ))}
      </div>

      <div className="section-title"><h2>Historique</h2></div>
      <div className="tabs">
        {[['', 'Tous'], ...Object.entries(GAME_META).map(([id, g]) => [id, g.name])].map(([id, l]) => (
          <button key={id || 'all'} className={`tab${historyGame === id ? ' active' : ''}`} onClick={() => setHistoryGame(id)}>{l}</button>
        ))}
      </div>
      <MatchHistory matches={matches} />

      <button className="btn block outline" style={{ marginTop: 12 }} onClick={async () => { await logout(); navigate('/'); }}>
        <Icon name="logout" size={18} /> Se déconnecter
      </button>
      <p className="tiny muted center">Compte créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')} · {user.phone}{user.legacyLinked ? ' · historique Swipe & Win conservé' : ''}</p>

      <Sheet open={edit} onClose={() => setEdit(false)} label="Modifier mon profil">
        <div className="stack lg">
          <h2 className="h3">Mon profil</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }} role="radiogroup" aria-label="Avatar">
            {AVATAR_IDS.map(id => (
              <button key={id} role="radio" aria-checked={form.avatar === id} onClick={() => setForm(f => ({ ...f, avatar: id }))}
                style={{ borderRadius: '50%', padding: 2, boxShadow: form.avatar === id ? '0 0 0 3px var(--yas-blue)' : 'none' }}>
                <Avatar id={id} size={34} />
              </button>
            ))}
          </div>
          <div className="field"><label htmlFor="un">Pseudonyme</label><div className="input-line"><input id="un" maxLength={20} value={form.username || ''} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div></div>
          <div className="field"><label htmlFor="bio">Bio</label><div className="input-line"><input id="bio" maxLength={160} value={form.bio || ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} /></div></div>
          {[['showStats', 'Afficher mes statistiques sur mon profil public'], ['allowInvites', 'Recevoir des invitations de mes amis']].map(([k, l]) => (
            <label key={k} className="checkbox">
              <input type="checkbox" checked={!!form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} />
              <span className="box">{form[k] && <Icon name="check" size={18} />}</span>
              <span>{l}</span>
            </label>
          ))}
          <button className="btn block" onClick={save}>Enregistrer</button>
        </div>
      </Sheet>
    </div>
  );
}
