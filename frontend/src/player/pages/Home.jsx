import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import { useSocketEvent } from '../../lib/socket';
import { useAuth } from '../AuthContext';
import { useSession } from '../SessionContext';
import { useToast } from '../ToastContext';
import Avatar from '../../components/Avatar';
import GameArt from '../../components/GameArt';
import Icon from '../../components/Icon';
import Pulse from '../../components/Pulse';
import { LeagueBadge, Spinner, Empty, Sheet } from '../../components/ui';
import { GAME_META, gameName, formatDate } from '../../lib/format';

export function Podium({ entries, unit = 'pts' }) {
  const [p1, p2, p3] = entries;
  const step = (e, cls, n) => (
    <div className={`step ${cls}`}>
      {e ? (
        <Link to={`/players/${e.userId}`} className="stack" style={{ alignItems: 'center', gap: 4, textDecoration: 'none', minWidth: 0, width: '100%' }}>
          {n === 1 && <span aria-hidden>👑</span>}
          <Avatar id={e.avatar} size={n === 1 ? 56 : 46} ring={n === 1} />
          <span className="name">{e.username}</span>
          <span className="val">{e.value} {unit}</span>
        </Link>
      ) : <span className="tiny muted">—</span>}
      <div className="block">{n}</div>
    </div>
  );
  return <div className="podium">{step(p2, 'p2', 2)}{step(p1, 'p1', 1)}{step(p3, 'p3', 3)}</div>;
}

// Carte de jeu (page Jeux) : illustration, joueurs en ligne, Jouer + classement.
export function GameCard({ game }) {
  const navigate = useNavigate();
  const meta = GAME_META[game.id] || {};
  return (
    <div className="game-card">
      <button className="art" onClick={() => navigate(`/games/${game.id}`)} aria-label={`Ouvrir ${game.name}`} style={{ padding: 0 }}>
        <GameArt gameId={game.id} height="100%" fit="meet" />
      </button>
      <div className="body">
        <div className="name">{game.name}</div>
        <div className="meta">
          <span>{meta.players}</span>
          {game.playersOnline > 0 && <span><span className="online-dot" />{game.playersOnline} en jeu</span>}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate(`/games/${game.id}`)} disabled={!game.isActive}>Jouer <span className="arrow" /></button>
          <button className="btn outline" style={{ flex: '0 0 44px', padding: 0 }} onClick={() => navigate(`/rankings?game=${game.id}`)} aria-label={`Classement ${game.name}`}>
            <Icon name="trophy" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Vignette verticale du carrousel « Nos jeux » (accueil).
export function GameTile({ game }) {
  const meta = GAME_META[game.id] || {};
  return (
    <Link to={`/games/${game.id}`} className="game-tile" aria-label={`${game.name}, ${meta.players}`}>
      <GameArt gameId={game.id} height="100%" fit="meet" />
      <span className="scrim" />
      <span className="label">
        <b>{game.name.replace('Yas ', '')}</b>
        <small>{meta.players}{game.playersOnline > 0 ? ` · ${game.playersOnline} en jeu` : ''}</small>
      </span>
    </Link>
  );
}

function SectionTitle({ children, to, link }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {to && <Link to={to} className="link">{link}</Link>}
    </div>
  );
}

const MORE = [
  { to: '/rankings', icon: 'trophy', label: 'Classement' },
  { to: '/tournaments', icon: 'medal', label: 'Tournois' },
  { to: '/friends', icon: 'friends', label: 'Amis' },
  { to: '/profile', icon: 'star', label: 'Badges' },
  { to: '/profile', icon: 'history', label: 'Historique', state: { tab: 'history' } },
  { to: '/games', icon: 'help', label: 'Règles' },
  { to: '/quiz', icon: 'ball', label: 'Swipe & gagne' },
  { to: '/notifications', icon: 'bell', label: 'Notifications' },
];

export default function Home() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { joinRoom, setUnread, quickPlay } = useSession();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [sheet, setSheet] = useState(null); // 'quick' | 'code'
  const [code, setCode] = useState('');

  const load = useCallback(() => {
    playerApi.get('/home').then(r => {
      setData(r.data);
      setUser(r.data.me);
      setUnread(r.data.unreadNotifications);
    }).catch(() => {});
  }, [setUser, setUnread]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useSocketEvent('friend:online', load);
  useSocketEvent('friend:offline', load);
  useSocketEvent('match:ended', load);

  if (!data) return <Spinner center />;
  const { me, games, friendsOnline, invites, tournaments, weekTop3 } = data;
  const p = me.progress;
  const pct = Math.round(Math.max(0, Math.min(1, p.progress || 0)) * 100);
  // Mise en avant : le défi du jour, sinon le jeu qui compte le plus de joueurs en ce moment.
  const featuredId = me.challenge?.gameId || [...games].filter(g => g.isActive).sort((a, b) => b.playersOnline - a.playersOnline)[0]?.id;
  const featured = games.find(g => g.id === featuredId);

  async function startQuick(gameId) {
    setSheet(null);
    try { await quickPlay(gameId, null); } catch (err) { toast(err.message, { icon: '⚠️' }); }
  }

  const ACTIONS = [
    { icon: 'zap', label: 'Partie rapide', onClick: () => setSheet('quick') },
    { icon: 'key', label: 'Code salon', onClick: () => setSheet('code') },
    { icon: 'userPlus', label: 'Inviter un ami', onClick: () => navigate('/friends') },
    { icon: 'medal', label: 'Tournois', onClick: () => navigate('/tournaments') },
  ];

  return (
    <div className="home-grid">
      <div className="home-main">
        {/* Deux cartes d'état, comme les cartes de solde de l'application Yas */}
        <section className="balance-row" aria-label="Ma progression">
          <Link to="/profile" className="balance-card yellow">
            <Pulse className="deco" size={230} rotate={-30} color="#FFEA8F" opacities={[1, 0.9, 0.7]} />
            <span className="kicker">Niveau</span>
            <span className="big">{p.level}</span>
            <span className="sub"><Icon name="zap" size={16} /> {p.xp} XP</span>
            <span className="mini-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progression vers le niveau ${p.level + 1}`}><i style={{ width: `${pct}%` }} /></span>
            <span className="foot"><span>{p.nextLevelXp - p.xp} XP avant le niveau {p.level + 1}</span><Icon name="chevron" size={18} /></span>
          </Link>
          <Link to="/rankings" className="balance-card blue">
            <Pulse className="deco" size={230} rotate={-30} opacities={[0.45, 0.3, 0.18]} />
            <span className="kicker">Points de saison</span>
            <span className="big">{p.seasonPoints}</span>
            <span className="sub">{p.globalRank ? `#${p.globalRank} au classement` : 'Pas encore classé'}</span>
            <span className="league"><LeagueBadge league={p.league} /></span>
            <span className="foot"><span>Voir le classement</span><Icon name="chevron" size={18} /></span>
          </Link>
        </section>

        {invites.map(n => (
          <div key={n.id} className="notice-card" role="status">
            <Avatar id={n.data.avatar} size={44} />
            <div className="grow">
              <b>{n.data.username} t'invite</b>
              <span>à une partie de {gameName(n.data.gameId)}</span>
            </div>
            <button className="btn sm blue" onClick={() => joinRoom(n.data.roomCode)}>Rejoindre <span className="arrow" /></button>
          </div>
        ))}

        <nav className="quick-actions" aria-label="Actions rapides">
          {ACTIONS.map(a => (
            <button key={a.label} onClick={a.onClick}>
              <span className="circle"><Icon name={a.icon} size={26} /></span>
              <span>{a.label}</span>
            </button>
          ))}
        </nav>

        {featured && (
          <section aria-label={me.challenge ? 'Défi du jour' : 'Recommandé'}>
            <SectionTitle to="/games" link="Tous les jeux">{me.challenge ? 'Défi du jour' : 'Recommandé pour toi'}</SectionTitle>
            <div className="offer-card">
              <div className="offer-art" aria-hidden><GameArt gameId={featured.id} height="100%" fit="meet" /></div>
              <div className="offer-body">
                <div className="offer-title"><Icon name={me.challenge ? 'star' : 'games'} size={26} /> {me.challenge ? `Gagne une partie de ${featured.name}` : featured.name}</div>
                <div className="offer-meta">
                  <span>{me.challenge ? <><b>+15</b> XP bonus</> : GAME_META[featured.id]?.players}</span>
                  <span>{featured.playersOnline > 0 ? <><b>{featured.playersOnline}</b> en jeu</> : 'Valable aujourd\'hui'}</span>
                </div>
                <button className="btn block" onClick={() => navigate(`/games/${featured.id}`)}>Jouer maintenant <span className="arrow" /></button>
              </div>
            </div>
          </section>
        )}

        <section aria-label="Nos jeux">
          <SectionTitle to="/games" link="Voir tout">Nos jeux</SectionTitle>
          <div className="tile-rail">{games.map(g => <GameTile key={g.id} game={g} />)}</div>
        </section>

        <section aria-label="Plus de Défi Yas">
          <SectionTitle>Plus de Défi Yas</SectionTitle>
          <div className="service-panel">
            {MORE.map(m => (
              <Link key={m.label} to={m.to} state={m.state} className="service-tile">
                <span className="ic"><Icon name={m.icon} size={26} /></span>
                <span>{m.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <aside className="home-aside">
        <section aria-label="Amis connectés">
          <SectionTitle to="/friends" link="Amis">Amis connectés</SectionTitle>
          {friendsOnline.length ? (
            <div className="card tight friends-rail">
              {friendsOnline.map(f => (
                <Link key={f.id} to={`/players/${f.id}`} className="friend-chip">
                  <Avatar id={f.avatar} size={46} online />
                  <span className="tiny bold">{f.username}</span>
                  <span className="tiny muted">{f.activity ? (f.activity.type === 'match' ? 'En partie' : 'En salon') : 'Dispo'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card tight row">
              <span className="circle-ic"><Icon name="friends" size={22} /></span>
              <span className="grow small">{data.friendsCount ? 'Aucun ami connecté pour le moment.' : 'Ajoute des amis pour les défier !'}</span>
              <Link to="/friends" className="btn sm outline">Ajouter</Link>
            </div>
          )}
        </section>

        {tournaments.length > 0 && (
          <section aria-label="Tournois actifs">
            <SectionTitle to="/tournaments" link="Voir">Tournois</SectionTitle>
            <div className="list">
              {tournaments.map(t => (
                <Link key={t.id} to={`/tournaments/${t.id}`} className="list-item">
                  <span className="circle-ic"><Icon name="medal" size={22} /></span>
                  <div className="grow">
                    <div className="title">{t.name}</div>
                    <div className="sub">{gameName(t.game_id)} · {t.participants}/{t.max_participants} · {formatDate(t.starts_at)}</div>
                  </div>
                  <span className={`chip ${t.status === 'in_progress' ? 'sky' : 'yellow'}`}>{t.status === 'in_progress' ? 'En cours' : 'Inscriptions'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Top 3 de la semaine">
          <SectionTitle to="/rankings?period=week" link="Classement">Top 3 de la semaine</SectionTitle>
          <div className="card">
            {weekTop3.length ? <Podium entries={weekTop3} /> : <Empty icon="🏆">Personne n'a encore marqué de points cette semaine. À toi de jouer !</Empty>}
          </div>
        </section>
      </aside>

      <Sheet open={sheet === 'quick'} onClose={() => setSheet(null)} label="Partie rapide">
        <h2 className="h2">Partie <span className="accent">rapide</span></h2>
        <p className="small muted" style={{ margin: '6px 0 14px' }}>Choisis un jeu : on te trouve un adversaire de ton niveau.</p>
        <div className="pick-grid">
          {games.filter(g => g.isActive).map(g => (
            <button key={g.id} className="pick" onClick={() => startQuick(g.id)}>
              <span className="pick-art"><GameArt gameId={g.id} height="100%" fit="meet" /></span>
              <b>{g.name}</b>
              <small>{GAME_META[g.id]?.players}</small>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'code'} onClose={() => setSheet(null)} label="Rejoindre un salon">
        <h2 className="h2">Rejoindre un <span className="accent">salon</span></h2>
        <p className="small muted" style={{ margin: '6px 0 14px' }}>Entre le code que ton ami t'a partagé.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setSheet(null); joinRoom(code); }}>
          <div className="input-pill">
            <span className="bold">YAS-</span>
            <input inputMode="numeric" maxLength={6} placeholder="482913" value={code} autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code du salon" />
          </div>
          <button className="btn block" disabled={code.length !== 6}>Rejoindre <span className="arrow" /></button>
        </form>
      </Sheet>
    </div>
  );
}
