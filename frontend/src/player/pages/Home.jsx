import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import { useSocketEvent } from '../../lib/socket';
import { useAuth } from '../AuthContext';
import { useSession } from '../SessionContext';
import Avatar from '../../components/Avatar';
import GameArt from '../../components/GameArt';
import Icon from '../../components/Icon';
import { LevelBar, LeagueBadge, Spinner, Empty } from '../../components/ui';
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

export function GameCard({ game }) {
  const navigate = useNavigate();
  const meta = GAME_META[game.id] || {};
  return (
    <div className="game-card">
      <button className="art" onClick={() => navigate(`/games/${game.id}`)} aria-label={`Ouvrir ${game.name}`} style={{ padding: 0 }}>
        <GameArt gameId={game.id} />
      </button>
      <div className="body">
        <div className="name">{game.name}</div>
        <div className="meta">
          <span>{meta.players}</span>
          <span><span className="online-dot" />{game.playersOnline} en jeu</span>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate(`/games/${game.id}`)} disabled={!game.isActive}>Jouer</button>
          <button className="btn outline" style={{ flex: '0 0 38px', padding: 0 }} onClick={() => navigate(`/rankings?game=${game.id}`)} aria-label={`Classement ${game.name}`}>
            <Icon name="trophy" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { setUser } = useAuth();
  const { joinRoom, setUnread } = useSession();
  const [data, setData] = useState(null);

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

  return (
    <div className="stack">
      <section className="card blue on-blue stack" aria-label="Mon profil">
        <div className="row">
          <Avatar id={me.avatar} size={56} />
          <div className="grow">
            <div className="h3" style={{ color: '#fff' }}>Salut <span className="accent">{me.username}</span> !</div>
            <div className="row small" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <LeagueBadge league={p.league} />
              <span>{p.globalRank ? `#${p.globalRank} global` : 'Pas encore classé'}</span>
            </div>
          </div>
        </div>
        <LevelBar progress={p} onBlue />
        <div className="row between small">
          <span><b>{p.xp}</b> XP</span>
          <span><b>{p.seasonPoints}</b> pts de saison</span>
        </div>
      </section>

      {me.challenge && (
        <Link to={`/games/${me.challenge.gameId}`} className="card yellow row" style={{ textDecoration: 'none', padding: '12px 16px' }}>
          <span style={{ fontSize: 28 }} aria-hidden>🎯</span>
          <div className="grow">
            <div className="bold">Défi du jour : gagne une partie de {gameName(me.challenge.gameId)}</div>
            <div className="tiny">+15 XP bonus</div>
          </div>
          <Icon name="play" size={20} />
        </Link>
      )}

      {invites.length > 0 && (
        <section aria-label="Invitations">
          <div className="section-title"><h2>Invitations</h2></div>
          <div className="list">
            {invites.map(n => (
              <div key={n.id} className="list-item">
                <Avatar id={n.data.avatar} size={40} />
                <div className="grow">
                  <div className="title">{n.data.username}</div>
                  <div className="sub">t'invite à {gameName(n.data.gameId)}</div>
                </div>
                <button className="btn sm" onClick={() => joinRoom(n.data.roomCode)}>Rejoindre</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Jouer maintenant">
        <div className="section-title"><h2>Jouer <span className="accent">maintenant</span></h2><Link to="/games" className="link">Tout voir</Link></div>
        <div className="games-grid">{games.map(g => <GameCard key={g.id} game={g} />)}</div>
      </section>

      <section aria-label="Amis connectés">
        <div className="section-title"><h2>Amis connectés</h2><Link to="/friends" className="link">Amis</Link></div>
        {friendsOnline.length ? (
          <div className="card tight row" style={{ overflowX: 'auto', gap: 14 }}>
            {friendsOnline.map(f => (
              <Link key={f.id} to={`/players/${f.id}`} className="stack" style={{ alignItems: 'center', gap: 4, width: 64, flexShrink: 0, textDecoration: 'none' }}>
                <Avatar id={f.avatar} size={46} online />
                <span className="tiny bold" style={{ maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.username}</span>
                <span className="tiny muted">{f.activity ? (f.activity.type === 'match' ? 'En partie' : 'En salon') : 'Dispo'}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card tight row">
            <span aria-hidden style={{ fontSize: 24 }}>👥</span>
            <span className="grow small">{data.friendsCount ? 'Aucun ami connecté pour le moment.' : 'Ajoute des amis pour les défier !'}</span>
            <Link to="/friends" className="btn sm outline">Ajouter</Link>
          </div>
        )}
      </section>

      {tournaments.length > 0 && (
        <section aria-label="Tournois actifs">
          <div className="section-title"><h2>Tournois</h2><Link to="/tournaments" className="link">Voir</Link></div>
          <div className="list">
            {tournaments.map(t => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="list-item">
                <span style={{ fontSize: 26 }} aria-hidden>🏆</span>
                <div className="grow">
                  <div className="title">{t.name}</div>
                  <div className="sub">{gameName(t.game_id)} · {t.participants}/{t.max_participants} · {formatDate(t.starts_at)}</div>
                </div>
                <span className={`chip ${t.status === 'in_progress' ? 'green' : 'yellow'}`}>{t.status === 'in_progress' ? 'En cours' : 'Inscriptions'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Top 3 de la semaine">
        <div className="section-title"><h2>Top 3 de la <span className="accent">semaine</span></h2><Link to="/rankings?period=week" className="link">Classement</Link></div>
        <div className="card">
          {weekTop3.length ? <Podium entries={weekTop3} /> : <Empty icon="🏆">Personne n'a encore marqué de points cette semaine. À toi de jouer !</Empty>}
        </div>
      </section>
    </div>
  );
}
