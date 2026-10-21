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
import ChatBar from '../../components/ChatBar';
import PlectreFrame from '../../components/PlectreFrame';
import CoinBadge from '../../components/CoinBadge';
import { Sheet, Spinner, Countdown, Confetti } from '../../components/ui';
import { gameName, placeLabel, formatDuration } from '../../lib/format';
import { levelLabel } from '../../components/BotPlay';

const GAMES = {
  connect: lazy(() => import('../../games/connect/ConnectGame')),
  ludo: lazy(() => import('../../games/ludo/LudoGame')),
  cards: lazy(() => import('../../games/cards/CardsGame')),
  foot: lazy(() => import('../../games/foot/FootGame')),
};
// Jeux affichés en plein écran (ils dessinent eux-mêmes boutons d'abandon et d'options).
const IMMERSIVE = new Set(['foot']);

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

// Fin de partie, dans l'esprit des fenêtres « Gamification » de l'appli Yas :
// carte blanche sur fond Sunshine Yellow, illustration (plectre + halo),
// titre deux tons, pastille « pièce » pour les points, bouton jaune.
function ResultArt({ icon }) {
  return (
    <span className="result-art" aria-hidden>
      <PlectreFrame size={170} rotate={-14} fill="#00377D" halo="#FFF1B4"><Icon name={icon} size={52} /></PlectreFrame>
    </span>
  );
}

function Results({ ended, me, onRematch, onBotRematch, gameId }) {
  const you = ended.you;
  const mine = ended.placements.find(p => p.userId === me);
  const won = !ended.isDraw && mine?.place === 1;
  const duel = ended.placements.length === 2;
  // Entraînement quitté par le joueur : pas de classement à afficher.
  const abandoned = ended.training && ['resign', 'forfeit'].includes(ended.reason) && mine?.outcome === 'loss';
  const [lead, rest] = ended.cancelled ? ['Partie', 'annulée'] : abandoned ? ['Partie', 'abandonnée'] : ended.isDraw ? ['Match', 'nul\u00a0!'] : won ? ['Bravo,', 'victoire\u00a0!']
    : duel && mine ? ['Oups,', 'pas cette fois\u00a0!'] : mine ? [placeLabel(mine.place), 'place'] : ['Partie', 'terminée'];
  const icon = ended.cancelled ? 'block' : abandoned ? 'flag' : ended.isDraw ? 'friends' : won ? 'trophy' : 'refresh';
  const delta = you ? you.ratingAfter - you.ratingBefore : 0;
  return (
    <div className="result-screen match-page">
      {won && <Confetti />}
      <div className="result-card">
        {you && ended.isValid && you.seasonPoints > 0 && (
          <CoinBadge value={`+${you.seasonPoints}`} label="pts saison" size={88} className="result-coin" />
        )}
        <ResultArt icon={icon} />
        <h1 className="result-title" aria-label={`${lead} ${rest}`}>
          <span className="hl">{lead}</span> {rest}
        </h1>
        <p className="result-sub">
          {gameName(gameId)}{ended.durationMs ? ` · ${formatDuration(ended.durationMs)}` : ''}
          {ended.reason === 'timeout' && ' · temps écoulé'}{ended.reason === 'forfeit' && ' · forfait'}{ended.reason === 'resign' && ' · abandon'}
        </p>

        {ended.training && !ended.cancelled && (
          <div className="alert info"><Icon name="bot" size={20} /> Partie d'entraînement contre {ended.bot?.opponents > 1 ? `${ended.bot.opponents} bots` : 'un bot'} ({levelLabel(ended.bot?.level)}) : elle ne compte ni pour l'XP, ni pour le classement.</div>
        )}
        {!ended.training && !ended.cancelled && ended.isValid === false && (
          <div className="alert warning"><Icon name="alert" size={20} /> Partie trop courte : elle n'est pas comptabilisée (ni XP, ni points, ni cote).</div>
        )}
        {you && ended.isValid && (
          <div className="result-stats">
            <span className="t-sky"><b>+{you.xpGained}</b>XP</span>
            <span className="t-berry"><b>{delta >= 0 ? '+' : ''}{delta}</b>Cote ({you.ratingAfter})</span>
            <span className="t-sunset"><b>+{you.seasonPoints}</b>Pts saison</span>
          </div>
        )}
        {you && ended.isValid && (
          <div className="result-notes">
            {you.levelAfter > you.levelBefore && <p><Icon name="star" size={18} /> Niveau {you.levelAfter} atteint !</p>}
            {you.challengeDone && <p><Icon name="zap" size={18} /> Défi du jour réussi : +15 XP</p>}
            {!you.counted && you.seasonPoints === 0 && mine?.place === 1 && (
              <p className="muted">Plafond de 10 matchs comptés par jour atteint pour ce jeu : tes XP restent acquis.</p>
            )}
            {you.badges?.map(b => <p key={b.id}>{b.icon} Badge débloqué : {b.name}</p>)}
          </div>
        )}

        {ended.placements.length > 0 && !abandoned && (
          <div className="tx-list result-list">
            {[...ended.placements].sort((a, b) => a.place - b.place).map(p => (
              <div key={p.userId} className={`tx-row${p.userId === me ? ' me' : ''}`}>
                <span className="rank-num">{p.place}</span>
                <Avatar id={p.avatar} size={40} />
                <span className="tx-text grow">
                  <b>{p.userId === me ? 'Toi' : p.username}{p.isBot && <span className="chip sky bot-chip">Bot</span>}</b>
                  <span>{p.outcome === 'win' ? 'Vainqueur' : p.outcome === 'draw' ? 'Nul' : p.outcome === 'loss' ? 'Défaite' : ''}
                    {p.stats?.goals != null ? ` · ${p.stats.goals} but(s)` : ''}{p.stats?.cardsLeft != null ? ` · ${p.stats.cardsLeft} carte(s)` : ''}</span>
                </span>
                {p.ratingAfter != null && <span className="rating-delta">{p.ratingAfter >= p.ratingBefore ? '+' : ''}{p.ratingAfter - p.ratingBefore}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="result-actions">
          {ended.training ? (
            <>
              <button className="btn block" onClick={onBotRematch}>Rejouer contre {ended.bot?.opponents > 1 ? 'les bots' : 'le bot'} <span className="arrow" /></button>
              <Link to={`/games/${gameId}`} className="btn block outline">Jouer contre de vrais joueurs</Link>
            </>
          ) : (
            <>
              {onRematch && <button className="btn block" onClick={onRematch}>Revanche <span className="arrow" /></button>}
              <Link to={`/games/${gameId}`} className={`btn block ${onRematch ? 'outline' : ''}`}>Rejouer</Link>
            </>
          )}
          <Link to="/" className="link-plain">Retour à l'accueil</Link>
        </div>
      </div>
    </div>
  );
}

export default function Match() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const { room, playBot } = useSession();
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

  async function botRematch() {
    try { await playBot(ended.gameId, ended.bot || {}); } catch (err) { toast(err.message, { icon: '⚠️' }); }
  }

  if (ended) {
    return <Results ended={ended} me={user?.id} gameId={ended.gameId} onBotRematch={botRematch}
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
  const bots = snap.players.filter(p => p.isBot);
  // Jeux plein écran : leur propre barre (abandon, options) remplace l'en-tête.
  const immersive = IMMERSIVE.has(snap.gameId) && snap.status !== 'READY' && !!snap.view;

  return (
    <div className={`stack match-page${immersive ? ' immersive' : ''}`} style={{ marginTop: -8 }}>
      {!immersive && <div className="row between">
        <button className="btn sm ghost" onClick={() => setResignOpen(true)} aria-label="Abandonner"><Icon name="flag" size={18} /> Abandonner</button>
        <span className="match-title">
          <span className="h3">{gameName(snap.gameId)}</span>
          {snap.training && <span className="chip sky"><Icon name="bot" size={14} /> Entraînement</span>}
        </span>
        {snap.training
          ? <span className="icon-btn" aria-hidden />
          : <button className="icon-btn" onClick={() => setChatOpen(true)} aria-label="Chat et réactions"><Icon name="chat" /></button>}
      </div>}

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
          <Game snapshot={snap} me={user?.id} sendAction={sendAction} matchId={matchId}
            onResign={() => setResignOpen(true)} onChat={snap.training ? null : () => setChatOpen(true)} />
        </Suspense>
      )}
      {/* Jeux plein écran : barre de chat en bas, comme dans Soccer Stars. */}
      {immersive && (
        <ChatBar roomId={snap.training ? null : snap.roomId} onHistory={() => setChatOpen(true)}
          disabledText="Le chat s'ouvre quand tu joues contre un vrai joueur" />
      )}

      <FloatingReactions matchId={matchId} players={snap.players} />

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} label="Chat">
        {snap.roomId ? <ChatPanel roomId={snap.roomId} matchId={matchId} /> : <p className="small muted">Chat indisponible pour cette partie.</p>}
      </Sheet>
      <Sheet open={resignOpen} center onClose={() => setResignOpen(false)} label="Abandonner">
        <div className="stack center">
          <h2 className="h2">Abandonner ?</h2>
          <p className="small">{snap.training
            ? `La partie d'entraînement contre ${bots.length > 1 ? 'les bots' : 'le bot'} s'arrête ici. Elle ne compte pas dans tes statistiques.`
            : 'La partie sera comptée comme une défaite.'}</p>
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
