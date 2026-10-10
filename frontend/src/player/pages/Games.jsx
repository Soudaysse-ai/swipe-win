import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import { emit } from '../../lib/socket';
import { useSession } from '../SessionContext';
import { useToast } from '../ToastContext';
import GameArt from '../../components/GameArt';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { BackHeader, Spinner, LeagueBadge, Sheet, Empty } from '../../components/ui';
import { GameCard, Podium } from './Home';
import { RULES } from '../../lib/rules';
import { GAME_META } from '../../lib/format';

export function GamesList() {
  const [games, setGames] = useState(null);
  useEffect(() => { playerApi.get('/games').then(r => setGames(r.data.games)).catch(() => setGames([])); }, []);
  return (
    <div className="stack">
      <h1 className="h1">Les <span className="accent">jeux</span></h1>
      {!games ? <Spinner center /> : <div className="games-grid">{games.map(g => <GameCard key={g.id} game={g} />)}</div>}
      <Link to="/tournaments" className="card row" style={{ textDecoration: 'none', marginTop: 8 }}>
        <span style={{ fontSize: 28 }} aria-hidden>🏆</span>
        <div className="grow"><div className="bold">Tournois & compétitions</div><div className="tiny muted">Inscris-toi aux tournois Défi Yas</div></div>
        <Icon name="back" style={{ transform: 'rotate(180deg)' }} />
      </Link>
      <Link to="/quiz" className="card row" style={{ textDecoration: 'none' }}>
        <span style={{ fontSize: 28 }} aria-hidden>⚽</span>
        <div className="grow"><div className="bold">Swipe & gagne</div><div className="tiny muted">Le quiz football Vrai / Faux</div></div>
        <Icon name="back" style={{ transform: 'rotate(180deg)' }} />
      </Link>
    </div>
  );
}

export function GameLobby() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { quickPlay, joinRoom, setRoom, mm } = useSession();
  const [data, setData] = useState(null);
  const [rules, setRules] = useState(false);
  const [code, setCode] = useState('');
  const [sizes, setSizes] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    playerApi.get(`/games/${gameId}`).then(r => setData(r.data)).catch(() => setData({ error: true }));
  }, [gameId]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  if (!data) return <Spinner center />;
  if (data.error) return <Empty icon="🤷">Jeu introuvable.</Empty>;
  const { game, top3, me, publicRooms } = data;
  const multi = game.maxPlayers > 2;
  const searching = mm.state === 'searching' && mm.gameId === gameId;

  async function create(visibility) {
    setBusy(true);
    try {
      const res = await emit('room:create', { gameId, visibility });
      setRoom(res.room);
      navigate('/room');
    } catch (err) { toast(err.message, { icon: '⚠️' }); } finally { setBusy(false); }
  }

  async function play() {
    try { await quickPlay(gameId, sizes); } catch (err) { toast(err.message, { icon: '⚠️' }); }
  }

  return (
    <div className="stack" style={{ marginTop: -16 }}>
      <BackHeader title={game.name} to="/games" right={
        <button className="icon-btn" onClick={() => setRules(true)} aria-label="Règles du jeu"><Icon name="flag" /></button>
      } />
      <div className="lobby-grid">
        <div className="stack lobby-main">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="lobby-art"><GameArt gameId={gameId} height="100%" fit="meet" /></div>
          <div style={{ padding: 16 }} className="stack">
            <p>{game.description}</p>
            <div className="row between small">
              <span>{GAME_META[gameId]?.players}</span>
              <span><span className="online-dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: 'var(--yas-sea-green)', marginRight: 4 }} />{game.playersOnline} joueurs en jeu</span>
            </div>
            {me && <div className="row small"><LeagueBadge league={me.league} /><span>Cote <b>{me.rating}</b> · #{me.rank}</span></div>}
          </div>
        </div>

        {multi && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="small bold">Nombre de joueurs (Jouer maintenant)</span>
            <div className="tabs" role="tablist">
              {[[null, 'Indifférent'], [[2], '2'], [[3], '3'], [[4], '4']].map(([v, label]) => (
                <button key={label} role="tab" aria-selected={JSON.stringify(sizes) === JSON.stringify(v)}
                  className={`tab${JSON.stringify(sizes) === JSON.stringify(v) ? ' active' : ''}`} onClick={() => setSizes(v)}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <button className="btn block" onClick={play} disabled={searching || !game.isActive}>
          {searching ? 'Recherche en cours…' : <>Jouer maintenant <span className="arrow" /></>}
        </button>
        <div className="row">
          <button className="btn md outline grow" onClick={() => create('private')} disabled={busy}><Icon name="lock" size={18} /> Salon privé</button>
          <button className="btn md outline grow" onClick={() => create('public')} disabled={busy}><Icon name="friends" size={18} /> Salon public</button>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); joinRoom(code); }}>
          <div className="input-pill grow">
            <span className="bold">YAS-</span>
            <input inputMode="numeric" maxLength={6} placeholder="482913" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code du salon" />
          </div>
          <button className="btn md blue" disabled={code.length !== 6}>Rejoindre</button>
        </form>

        </div>
        <div className="lobby-side">
        <div className="section-title"><h2>Salons publics</h2></div>
        {publicRooms.length ? (
          <div className="list">
            {publicRooms.map(r => (
              <button key={r.id} className="list-item" onClick={() => joinRoom(r.code)}>
                <div className="row" style={{ gap: 2 }}>{r.players.slice(0, 3).map(p => <Avatar key={p.userId} id={p.avatar} size={34} />)}</div>
                <div className="grow">
                  <div className="title">Salon de {r.players.find(p => p.userId === r.hostId)?.username || r.players[0]?.username}</div>
                  <div className="sub">{r.players.length}/{r.maxPlayers} joueurs</div>
                </div>
                <span className="btn sm">Rejoindre</span>
              </button>
            ))}
          </div>
        ) : <div className="card tight small muted">Aucun salon public ouvert. Crée le tien !</div>}

        <div className="section-title"><h2>Meilleurs joueurs</h2><Link to={`/rankings?game=${gameId}`} className="link">Classement</Link></div>
        <div className="card">{top3.length ? <Podium entries={top3} unit="" /> : <Empty icon="🏆">Pas encore de classement.</Empty>}</div>

        </div>
      </div>

      <Sheet open={rules} onClose={() => setRules(false)} label="Règles">
        <h2 className="h2" style={{ marginBottom: 12 }}>Règles de {game.name}</h2>
        <ul className="stack small" style={{ paddingLeft: 18, lineHeight: 1.45 }}>
          {(RULES[gameId] || []).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => setRules(false)}>Compris</button>
      </Sheet>
    </div>
  );
}
