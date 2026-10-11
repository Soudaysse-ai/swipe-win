import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { emit, useSocketEvent } from '../../lib/socket';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useSession } from '../SessionContext';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import PlectreFrame from '../../components/PlectreFrame';
import GameArt from '../../components/GameArt';
import { ReportSheet } from '../../components/ChatPanel';
import { BackHeader, Spinner, Empty, Sheet, LeagueBadge, LevelBar } from '../../components/ui';
import { GAME_META, gameName, timeAgo, percent, formatDate, OUTCOME_LABEL } from '../../lib/format';

function InviteToGame({ friend, onClose }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  if (!friend) return null;
  async function invite(gameId) {
    try {
      await emit('friend:invite', { friendId: friend.id, gameId });
      toast(`Invitation envoyée à ${friend.username}`, { icon: '📨' });
      onClose();
      navigate('/room');
    } catch (err) { toast(err.message); }
  }
  return (
    <Sheet open onClose={onClose} label="Inviter à jouer">
      <h2 className="h3" style={{ marginBottom: 12 }}>Défier {friend.username}</h2>
      <div className="stack">
        {Object.entries(GAME_META).map(([id, g]) => (
          <button key={id} className="btn block outline" onClick={() => invite(id)}>{g.name}</button>
        ))}
      </div>
    </Sheet>
  );
}

export function Friends() {
  const { toast } = useToast();
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState(null);
  const [requests, setRequests] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [inviteFriend, setInviteFriend] = useState(null);

  const load = useCallback(() => {
    playerApi.get('/friends').then(r => setFriends(r.data.friends)).catch(() => setFriends([]));
    playerApi.get('/friends/requests').then(r => setRequests(r.data.requests)).catch(() => {});
    playerApi.get('/blocks').then(r => setBlocked(r.data.blocked)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('friend:online', load);
  useSocketEvent('friend:offline', load);
  useSocketEvent('friend:request', load);
  useSocketEvent('friend:accepted', load);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => playerApi.get('/friends/search', { params: { q } }).then(r => setResults(r.data.users)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function act(fn, msg) {
    try { await fn(); if (msg) toast(msg); load(); if (q) setQ(x => `${x}`); } catch (err) { toast(apiError(err)); }
  }

  const incoming = requests.filter(r => r.direction === 'incoming');
  const outgoing = requests.filter(r => r.direction === 'outgoing');

  return (
    <div className="stack">
      <h1 className="h1">Mes <span className="accent">amis</span></h1>
      <div className="input-pill">
        <Icon name="search" size={20} />
        <input placeholder="Rechercher un pseudonyme" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher un joueur" />
        {q && <button onClick={() => setQ('')} aria-label="Effacer"><Icon name="close" size={18} /></button>}
      </div>
      {results.length > 0 && (
        <div className="list">
          {results.map(u => (
            <div key={u.id} className="list-item">
              <Link to={`/players/${u.id}`}><Avatar id={u.avatar} size={40} online={u.online} /></Link>
              <div className="grow"><div className="title">{u.username}</div><div className="sub">Niveau {u.level}</div></div>
              {u.is_friend ? <span className="chip sky">Ami</span>
                : u.pending === 'outgoing' ? <span className="chip">Demande envoyée</span>
                  : <button className="btn sm" onClick={() => act(() => playerApi.post('/friends/requests', { userId: u.id }).then(() => setResults(rs => rs.map(x => x.id === u.id ? { ...x, pending: 'outgoing' } : x))), u.pending === 'incoming' ? 'Vous êtes maintenant amis !' : 'Demande envoyée')}>
                    {u.pending === 'incoming' ? 'Accepter' : 'Ajouter'}</button>}
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist">
        {[['friends', `Amis${friends ? ` (${friends.length})` : ''}`], ['requests', `Demandes${incoming.length ? ` (${incoming.length})` : ''}`], ['blocked', 'Bloqués']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'friends' && (!friends ? <Spinner /> : friends.length ? (
        <div className="list">
          {friends.map(f => (
            <div key={f.id} className="list-item">
              <Link to={`/players/${f.id}`}><Avatar id={f.avatar} size={44} online={f.online} /></Link>
              <div className="grow">
                <div className="title">{f.username}</div>
                <div className="sub">{f.online ? (f.activity ? `${f.activity.type === 'match' ? 'En partie' : 'En salon'} · ${gameName(f.activity.gameId)}` : 'En ligne') : f.last_seen_at ? `Vu ${timeAgo(f.last_seen_at)}` : 'Hors ligne'}</div>
              </div>
              <button className="btn sm" onClick={() => setInviteFriend(f)} disabled={!f.online}>Défier</button>
            </div>
          ))}
        </div>
      ) : <Empty icon="👥">Recherche un pseudonyme pour ajouter tes premiers amis.</Empty>)}

      {tab === 'requests' && (
        <div className="stack">
          {!incoming.length && !outgoing.length && <Empty icon="📭">Aucune demande en attente.</Empty>}
          {incoming.length > 0 && <div className="list">{incoming.map(r => (
            <div key={r.id} className="list-item">
              <Avatar id={r.avatar} size={40} />
              <div className="grow"><div className="title">{r.username}</div><div className="sub">{timeAgo(r.created_at)}</div></div>
              <button className="btn sm" onClick={() => act(() => playerApi.post(`/friends/requests/${r.id}/accept`), 'Nouvel ami !')}>Accepter</button>
              <button className="icon-btn" aria-label="Refuser" onClick={() => act(() => playerApi.post(`/friends/requests/${r.id}/decline`))}><Icon name="close" /></button>
            </div>
          ))}</div>}
          {outgoing.length > 0 && <><span className="small bold">Envoyées</span><div className="list">{outgoing.map(r => (
            <div key={r.id} className="list-item">
              <Avatar id={r.avatar} size={40} />
              <div className="grow"><div className="title">{r.username}</div><div className="sub">En attente</div></div>
              <button className="btn sm outline" onClick={() => act(() => playerApi.delete(`/friends/requests/${r.id}`))}>Annuler</button>
            </div>
          ))}</div></>}
        </div>
      )}

      {tab === 'blocked' && (blocked.length ? (
        <div className="list">{blocked.map(b => (
          <div key={b.id} className="list-item">
            <Avatar id={b.avatar} size={40} />
            <div className="grow title">{b.username}</div>
            <button className="btn sm outline" onClick={() => act(() => playerApi.delete(`/blocks/${b.id}`), 'Joueur débloqué')}>Débloquer</button>
          </div>
        ))}</div>
      ) : <Empty icon="🕊️">Aucun joueur bloqué.</Empty>)}

      <InviteToGame friend={inviteFriend} onClose={() => setInviteFriend(null)} />
    </div>
  );
}

// Statistiques d'un jeu : illustration dans le plectre et tuiles dans la teinte du jeu.
export function GameStatsCard({ g }) {
  const meta = GAME_META[g.gameId] || {};
  const tile = { background: meta.tint };
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row between">
        <span className="row" style={{ gap: 10 }}>
          <PlectreFrame size={48} halo={meta.tint}><GameArt gameId={g.gameId} height="100%" fit="meet" /></PlectreFrame>
          <span className="h3">{g.name}</span>
        </span>
        <LeagueBadge league={g.league} />
      </div>
      <div className="stat-grid">
        <div className="stat" style={tile}><b>{g.rating}</b><span>Cote</span></div>
        <div className="stat" style={tile}><b>{g.played}</b><span>Parties</span></div>
        <div className="stat" style={tile}><b>{percent(g.winRate)}</b><span>Victoires</span></div>
      </div>
      <div className="row between tiny muted wrap">
        <span>{g.wins} V · {g.losses} D{g.draws ? ` · ${g.draws} N` : ''}</span>
        <span>Série max : {g.bestStreak}</span>
        {g.gameId === 'penalty' && g.extra?.shots ? <span>{g.extra.goals || 0} buts / {g.extra.shots} tirs · {g.extra.saves || 0} arrêts</span> : null}
        {(g.gameId === 'ludo' || g.gameId === 'cards') && g.played ? <span>Places : {g.places.join(' / ')}</span> : null}
      </div>
    </div>
  );
}

export function MatchHistory({ matches }) {
  if (!matches) return <Spinner />;
  if (!matches.length) return <Empty icon="🕹️">Aucune partie pour le moment.</Empty>;
  return (
    <div className="list">
      {matches.map(m => (
        <div key={m.matchId} className="list-item">
          <span className={`chip ${m.outcome === 'win' ? 'green' : m.outcome === 'loss' ? 'red' : ''}`} style={{ width: 70, justifyContent: 'center' }}>
            {m.status === 'CANCELLED' ? 'Annulée' : m.placement && m.outcome !== 'win' && m.opponents.length > 1 ? `${m.placement}e` : OUTCOME_LABEL[m.outcome] || '—'}
          </span>
          <div className="grow">
            <div className="title">{gameName(m.gameId)}</div>
            <div className="sub">vs {m.opponents.map(o => o.username).join(', ')} · {m.endedAt ? formatDate(m.endedAt) : ''}{m.training ? ' · entraînement' : m.isValid === false ? ' · non comptée' : ''}</div>
          </div>
          {m.ratingDelta != null && <span className={`small bold`} style={{ color: m.ratingDelta >= 0 ? '#1E7A42' : '#B42A28' }}>{m.ratingDelta >= 0 ? '+' : ''}{m.ratingDelta}</span>}
        </div>
      ))}
    </div>
  );
}

export function PublicProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [matches, setMatches] = useState(null);
  const [relation, setRelation] = useState(null);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (id === user?.id) { navigate('/profile', { replace: true }); return; }
    playerApi.get(`/players/${id}/public`).then(r => setP(r.data.player)).catch(() => setP({ error: true }));
    playerApi.get(`/players/${id}/matches`).then(r => setMatches(r.data.matches)).catch(() => setMatches([]));
    playerApi.get('/friends').then(r => setRelation(r.data.friends.some(f => f.id === id) ? 'friend' : 'none')).catch(() => {});
  }, [id, user, navigate]);

  if (!p) return <Spinner center />;
  if (p.error) return <Empty icon="🤷">Joueur introuvable.</Empty>;

  return (
    <div className="stack">
      <BackHeader title={p.username} />
      <div className="card blue on-blue stack center">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar id={p.avatar} size={80} /></div>
        <div className="h2" style={{ color: '#fff' }}>{p.username}</div>
        {p.bio && <p className="small">{p.bio}</p>}
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
          <LeagueBadge league={p.progress.league} />
          <span className="chip yellow">Niveau {p.progress.level}</span>
          {p.progress.globalRank && <span className="chip">#{p.progress.globalRank} global</span>}
        </div>
        <LevelBar progress={p.progress} onBlue />
      </div>
      <div className="row">
        {relation === 'friend' ? <span className="chip sky grow" style={{ justifyContent: 'center', height: 44 }}>✓ Ami</span>
          : <button className="btn md grow" onClick={async () => {
            try { await playerApi.post('/friends/requests', { userId: id }); toast('Demande envoyée'); setRelation('pending'); } catch (err) { toast(apiError(err)); }
          }} disabled={relation === 'pending'}>{relation === 'pending' ? 'Demande envoyée' : 'Ajouter en ami'}</button>}
        <button className="btn md outline" onClick={() => setReport({ userId: id, username: p.username })}><Icon name="flag" size={18} /> Signaler</button>
      </div>
      {p.badges.length > 0 && (
        <div className="card row wrap" style={{ gap: 8 }}>
          {p.badges.map(b => <span key={b.id} className="chip yellow" title={b.description}>{b.icon} {b.name}</span>)}
        </div>
      )}
      {p.statsHidden ? <div className="card small muted">Ce joueur a choisi de masquer ses statistiques.</div> : (
        <>
          <div className="section-title"><h2>Statistiques</h2></div>
          {p.games.filter(g => g.played).map(g => <GameStatsCard key={g.gameId} g={g} />)}
          {!p.games.some(g => g.played) && <Empty>Pas encore de partie jouée.</Empty>}
          <div className="section-title"><h2>Dernières parties</h2></div>
          <MatchHistory matches={matches} />
        </>
      )}
      {report && <ReportSheet target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

export function Notifications() {
  const { setUnread, joinRoom } = useSession();
  const [list, setList] = useState(null);
  useEffect(() => {
    playerApi.get('/notifications').then(r => {
      setList(r.data.notifications);
      if (r.data.unread) playerApi.post('/notifications/read', { ids: 'all' }).then(() => setUnread(0)).catch(() => {});
    }).catch(() => setList([]));
  }, [setUnread]);
  const ICON = { invite: '🎮', friend_request: '👋', friend_accepted: '🤝', level_up: '⭐', badge: '🏅', tournament_match: '🏆', tournament_results: '🏆', moderation: '🛡️' };
  return (
    <div className="stack">
      <BackHeader title="Notifications" />
      {!list ? <Spinner center /> : !list.length ? <Empty icon="🔔">Aucune notification.</Empty> : (
        <div className="list">
          {list.map(n => (
            <div key={n.id} className="list-item" style={{ background: n.read_at ? '#fff' : 'var(--yas-yellow-15)' }}>
              <span style={{ fontSize: 24 }} aria-hidden>{ICON[n.type] || '🔔'}</span>
              <div className="grow">
                <div className="title" style={{ whiteSpace: 'normal' }}>{n.title}</div>
                {n.body && <div className="sub">{n.body}</div>}
                <div className="sub">{timeAgo(n.created_at)}</div>
              </div>
              {(n.type === 'invite' || n.type === 'tournament_match') && n.data?.roomCode && Date.now() - new Date(n.created_at) < 3600_000 && (
                <button className="btn sm" onClick={() => joinRoom(n.data.roomCode)}>Rejoindre</button>
              )}
              {n.type === 'friend_request' && <Link to="/friends" className="btn sm outline">Voir</Link>}
              {n.type.startsWith('tournament') && n.data?.tournamentId && <Link to={`/tournaments/${n.data.tournamentId}`} className="btn sm outline">Voir</Link>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
