// Écran de partie générique : la logique de jeu est entièrement côté serveur ;
// ce composant affiche l'état officiel reçu et envoie les commandes du joueur.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { emit, newCommandId, onSocket, useSocketEvent, useConnectionStatus } from '../../lib/socket';
import { useAuth } from '../AuthContext';
import { useSession } from '../SessionContext';
import { useToast } from '../ToastContext';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import ChatPanel from '../../components/ChatPanel';
import { Sheet, Spinner, Countdown, Confetti } from '../../components/ui';
import { gameName, placeLabel, formatDuration } from '../../lib/format';

const GAMES = {
  connect: lazy(() => import('../../games/connect/ConnectGame')),
};

// Abonnement aux événements de jeu (animations) pour un match donné.
export function useGameEvents(matchId, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onSocket('game:event', (e) => { if (e.matchId === matchId) ref.current(e); }), [matchId]);
}

function FloatingReactions({ matchId, players }) {
  const [items, setItems] = useState([]);
  useSocketEvent('chat:message', (m) => {
    if (m.kind !== 'reaction' || !players.some(p => p.userId === m.userId)) return;
    const id = m.id;
    setItems(list => [...list, { id, emoji: m.body, seat: players.findIndex(p => p.userId === m.userId) }]);
    setTimeout(() => setItems(list => list.filter(x => x.id !== id)), 2200);
  });
  void matchId;
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      {items.map(it => (
        <span key={it.id} style={{
          position: 'absolute', left: `${15 + (it.seat * 22) % 70}%`, bottom: '30%', fontSize: 38,
          animation: 'float-up 2.2s ease-out forwards',
        }}>{it.emoji}</span>
      ))}
      <style>{'@keyframes float-up { from { transform: translateY(0); opacity: 1 } to { transform: translateY(-160px); opacity: 0 } }'}</style>
    </div>
  );
}

function Results({ ended, me, onRematch, gameId }) {
  const you = ended.you;
  const mine = ended.placements.find(p => p.userId === me);
  const won = !ended.isDraw && mine?.place === 1;
  const duel = ended.placements.length === 2;
  const title = ended.cancelled ? 'Partie annulée' : ended.isDraw ? 'Match nul' : won ? 'Victoire !' : duel && mine ? 'Défaite' : mine ? `${placeLabel(mine.place)} place` : 'Partie terminée';
  const emoji = ended.cancelled ? '🚫' : ended.isDraw ? '🤝' : won ? '🏆' : mine?.place === 2 && ended.placements.length > 2 ? '🥈' : '💪';
  return (
    <div className="stack lg">
      {won && <Confetti />}
      <div className="result-hero">
        <div className="emoji" aria-hidden>{emoji}</div>
        <h1 className="h1" style={{ marginTop: 8 }}>{title}</h1>
        <p className="small muted" style={{ marginTop: 4 }}>
          {gameName(gameId)}{ended.durationMs ? ` · ${formatDuration(ended.durationMs)}` : ''}
          {ended.reason === 'timeout' && ' · temps écoulé'}{ended.reason === 'forfeit' && ' · forfait'}{ended.reason === 'resign' && ' · abandon'}
        </p>
      </div>
      {!ended.cancelled && ended.isValid === false && (
        <div className="alert warning"><Icon name="alert" size={20} /> Partie trop courte : elle n'est pas comptabilisée (ni XP, ni points, ni cote).</div>
      )}
      {you && ended.isValid && (
        <div className="card blue on-blue stack">
          <div className="stat-grid">
            <div className="stat" style={{ background: 'rgba(255,255,255,.1)' }}><b style={{ color: '#FFD100' }}>+{you.xpGained}</b><span style={{ color: '#fff' }}>XP</span></div>
            <div className="stat" style={{ background: 'rgba(255,255,255,.1)' }}>
              <b style={{ color: '#FFD100' }}>{you.ratingAfter - you.ratingBefore >= 0 ? '+' : ''}{you.ratingAfter - you.ratingBefore}</b>
              <span style={{ color: '#fff' }}>Cote ({you.ratingAfter})</span>
            </div>
            <div className="stat" style={{ background: 'rgba(255,255,255,.1)' }}><b style={{ color: '#FFD100' }}>+{you.seasonPoints}</b><span style={{ color: '#fff' }}>Pts saison</span></div>
          </div>
          {you.levelAfter > you.levelBefore && <div className="center bold">⭐ Niveau {you.levelAfter} atteint !</div>}
          {you.challengeDone && <div className="center bold">🎯 Défi du jour réussi : +15 XP</div>}
          {!you.counted && you.seasonPoints === 0 && ended.placements.length > 0 && mine?.place === 1 && (
            <div className="tiny center">Plafond de 10 matchs comptés par jour atteint pour ce jeu : tes XP restent acquis.</div>
          )}
          {you.badges?.map(b => <div key={b.id} className="center bold">{b.icon} Badge débloqué : {b.name}</div>)}
        </div>
      )}
      {ended.placements.length > 0 && (
        <div className="list">
          {[...ended.placements].sort((a, b) => a.place - b.place).map(p => (
            <div key={p.userId} className={`list-item${p.userId === me ? ' me' : ''}`}>
              <span className="rank-num">{p.place}</span>
              <Avatar id={p.avatar} size={40} />
              <div className="grow">
                <div className="title">{p.username}</div>
                <div className="sub">{p.outcome === 'win' ? 'Vainqueur' : p.outcome === 'draw' ? 'Nul' : p.outcome === 'loss' ? 'Défaite' : ''}
                  {p.stats?.goals != null ? ` · ${p.stats.goals} but(s)` : ''}{p.stats?.cardsLeft != null ? ` · ${p.stats.cardsLeft} carte(s)` : ''}</div>
              </div>
              {p.ratingAfter != null && <span className={`chip ${p.ratingAfter >= p.ratingBefore ? 'green' : 'red'}`}>{p.ratingAfter >= p.ratingBefore ? '+' : ''}{p.ratingAfter - p.ratingBefore}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="stack">
        {onRematch && <button className="btn block" onClick={onRematch}>Revanche <span className="arrow" /></button>}
        <Link to={`/games/${gameId}`} className="btn block outline">Rejouer</Link>
        <Link to="/" className="btn block ghost">Accueil</Link>
      </div>
    </div>
  );
}

export default function Match() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const { room } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const conn = useConnectionStatus();
  const [snap, setSnap] = useState(null);
  const [ended, setEnded] = useState(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState({}); // userId -> until
  const [chatOpen, setChatOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const pending = useRef(false);

  const sync = useCallback(async () => {
    try {
      const r = await emit('match:sync', { matchId });
      if (r.snapshot) setSnap(r.snapshot); else if (!ended) setMissing(true);
    } catch { /* hors ligne : on réessaiera à la reconnexion */ }
  }, [matchId, ended]);

  useEffect(() => { setSnap(null); setEnded(null); setMissing(false); }, [matchId]);
  useEffect(() => { if (conn.connected) sync(); }, [conn.connected, sync]);

  useSocketEvent('match:state', (s) => { if (s.matchId === matchId) { setSnap(s); setMissing(false); } });
  useSocketEvent('match:ended', (e) => { if (e.matchId === matchId) setEnded(e); });
  useSocketEvent('player:disconnected', (e) => { if (e.matchId === matchId) setOffline(o => ({ ...o, [e.userId]: e.until })); });
  useSocketEvent('player:reconnected', (e) => {
    if (e.matchId !== matchId) return;
    setOffline(o => { const n = { ...o }; delete n[e.userId]; return n; });
  });

  // Envoi d'une commande : identifiant unique + version attendue (anti-doublon / anti-désynchro).
  const sendAction = useCallback(async (action) => {
    if (!snap || pending.current) return false;
    pending.current = true;
    const commandId = newCommandId();
    const payload = { matchId, commandId, version: snap.version, action };
    try {
      await emit('match:action', payload);
      return true;
    } catch (err) {
      if (err.code === 'TIMEOUT') {
        try { await emit('match:action', payload); return true; } catch { /* resynchronisation ci-dessous */ }
      }
      if (err.code === 'STALE_VERSION') sync();
      else toast(err.message, { icon: '⚠️', duration: 2500 });
      return false;
    } finally {
      pending.current = false;
    }
  }, [snap, matchId, sync, toast]);

  async function rematch() {
    try {
      await emit('room:ready', { ready: true });
      navigate('/room');
    } catch (err) { toast(err.message); navigate(`/games/${ended.gameId}`); }
  }

  if (ended) {
    return <Results ended={ended} me={user?.id} gameId={ended.gameId}
      onRematch={room && room.id === ended.roomId && room.source !== 'tournament' ? rematch : null} />;
  }
  if (missing) {
    return (
      <div className="stack center" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 48 }}>🏁</div>
        <p className="bold">Cette partie est terminée ou introuvable.</p>
        <Link to="/" className="btn block">Retour à l'accueil</Link>
      </div>
    );
  }
  if (!snap) return <Spinner center />;

  const Game = GAMES[snap.gameId];
  const others = snap.players.filter(p => p.userId !== user?.id);

  return (
    <div className="stack" style={{ marginTop: -8 }}>
      <div className="row between">
        <button className="btn sm ghost" onClick={() => setResignOpen(true)} aria-label="Abandonner"><Icon name="flag" size={18} /> Abandonner</button>
        <span className="h3">{gameName(snap.gameId)}</span>
        <button className="icon-btn" onClick={() => setChatOpen(true)} aria-label="Chat et réactions"><Icon name="chat" /></button>
      </div>

      {others.filter(p => !p.connected && !p.forfeited).map(p => (
        <div key={p.userId} className="alert warning" role="status">
          <Icon name="wifiOff" size={20} />
          <span>{p.username} s'est déconnecté{offline[p.userId] ? <> — <Countdown until={offline[p.userId]} /> s pour revenir</> : '…'}</span>
        </div>
      ))}

      {snap.status === 'READY' || !snap.view ? (
        <div className="card center stack" style={{ padding: 40 }}>
          <p className="bold">La partie commence dans</p>
          <div className="h1" style={{ fontSize: 64 }}>{snap.startsAt ? <Countdown until={snap.startsAt} /> : '…'}</div>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            {snap.players.map(p => <Avatar key={p.userId} id={p.avatar} size={44} online={p.connected} />)}
          </div>
        </div>
      ) : (
        <Suspense fallback={<Spinner center />}>
          <Game snapshot={snap} me={user?.id} sendAction={sendAction} matchId={matchId} />
        </Suspense>
      )}

      <FloatingReactions matchId={matchId} players={snap.players} />

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} label="Chat">
        {snap.roomId ? <ChatPanel roomId={snap.roomId} matchId={matchId} /> : <p className="small muted">Chat indisponible pour cette partie.</p>}
      </Sheet>
      <Sheet open={resignOpen} center onClose={() => setResignOpen(false)} label="Abandonner">
        <div className="stack center">
          <h2 className="h2">Abandonner ?</h2>
          <p className="small">La partie sera comptée comme une défaite.</p>
          <button className="btn block danger" onClick={async () => {
            setResignOpen(false);
            try { await emit('match:resign', { matchId }); } catch (err) { toast(err.message); }
          }}>Oui, abandonner</button>
          <button className="btn block outline" onClick={() => setResignOpen(false)}>Continuer à jouer</button>
        </div>
      </Sheet>
    </div>
  );
}
