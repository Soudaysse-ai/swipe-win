// État temps réel partagé : salon courant, matchmaking, invitations,
// notifications. Redirige automatiquement vers la partie qui démarre.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { emit, onSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { gameName } from '../lib/format';

const SessionCtx = createContext(null);

export function SessionProvider({ children }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const locRef = useRef(location.pathname);
  locRef.current = location.pathname;

  const [room, setRoom] = useState(null);
  const [mm, setMm] = useState({ state: 'idle' });
  const [proposal, setProposal] = useState(null);
  const [unread, setUnread] = useState(0);
  const [activeMatchId, setActiveMatchId] = useState(null);

  useEffect(() => {
    if (!token) { setRoom(null); setMm({ state: 'idle' }); setProposal(null); setActiveMatchId(null); return undefined; }
    const offs = [
      onSocket('session:restore', (s) => {
        setRoom(s.room || null);
        if (s.matchmaking) setMm(s.matchmaking);
        setActiveMatchId(s.matchId || null);
        if (s.matchId && !locRef.current.startsWith('/match/')) {
          toast('Ta partie est toujours en cours', { icon: '🎮', action: { label: 'Reprendre', onClick: () => navigate(`/match/${s.matchId}`) }, duration: 8000 });
        }
      }),
      onSocket('room:state', (r) => setRoom(r)),
      onSocket('room:left', ({ roomId }) => setRoom(cur => (cur?.id === roomId ? null : cur))),
      onSocket('matchmaking:status', (s) => setMm(s)),
      onSocket('matchmaking:found', (p) => { setProposal({ ...p, accepted: [] }); setMm({ state: 'found', gameId: p.gameId }); }),
      onSocket('matchmaking:confirmations', (c) => setProposal(p => (p && p.proposalId === c.proposalId ? { ...p, accepted: c.accepted } : p))),
      onSocket('matchmaking:cancelled', (c) => {
        setProposal(p => (p?.proposalId === c.proposalId ? null : p));
        if (c.reason === 'other_declined') toast('Un joueur n\'a pas confirmé, recherche relancée…', { icon: '🔄' });
        else if (c.reason === 'not_confirmed') toast('Recherche annulée', { icon: '⏱️' });
      }),
      onSocket('match:starting', (m) => {
        setProposal(null);
        setMm({ state: 'idle' });
        setActiveMatchId(m.matchId);
        navigate(`/match/${m.matchId}`);
      }),
      onSocket('match:ended', (e) => setActiveMatchId(cur => (cur === e.matchId ? null : cur))),
      onSocket('notification:new', (n) => {
        setUnread(u => u + 1);
        if (n.type === 'invite') return; // géré par friend:invite
        if (!locRef.current.startsWith('/match/')) toast(n.title, { icon: '🔔' });
      }),
      onSocket('friend:invite', (inv) => {
        toast(`${inv.username} t'invite à ${gameName(inv.gameId)}`, {
          icon: '🎮', duration: 15000,
          action: { label: 'Rejoindre', onClick: () => joinRoom(inv.roomCode) },
        });
      }),
      onSocket('friend:request', (r) => toast(`${r.username} veut devenir ton ami`, {
        icon: '👋', action: { label: 'Voir', onClick: () => navigate('/friends') },
      })),
    ];
    return () => offs.forEach(off => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { if (user) setUnread(user.unreadNotifications ?? unread); }, [user]); // eslint-disable-line

  async function joinRoom(code) {
    try {
      const res = await emit('room:join', { code });
      setRoom(res.room);
      navigate('/room');
    } catch (err) {
      toast(err.message, { icon: '⚠️' });
    }
  }

  async function quickPlay(gameId, sizes) {
    await emit('matchmaking:join', { gameId, sizes });
    setMm({ state: 'searching', gameId, since: Date.now(), sizes });
  }

  // Partie d'entraînement contre des bots : démarre aussitôt (match:starting redirige).
  async function playBot(gameId, { opponents = 1, level = 'normal' } = {}) {
    await emit('bot:start', { gameId, opponents, level });
    setProposal(null);
    setMm({ state: 'idle' });
  }

  async function cancelSearch() {
    await emit('matchmaking:leave').catch(() => {});
    setMm({ state: 'idle' });
  }

  async function answerProposal(accept) {
    if (!proposal) return;
    const id = proposal.proposalId;
    if (accept) await emit('matchmaking:accept', { proposalId: id }).catch((e) => toast(e.message));
    else { await emit('matchmaking:decline', { proposalId: id }).catch(() => {}); setProposal(null); setMm({ state: 'idle' }); }
  }

  return (
    <SessionCtx.Provider value={{
      room, setRoom, mm, proposal, quickPlay, playBot, cancelSearch, answerProposal, joinRoom,
      unread, setUnread, activeMatchId,
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

export const useSession = () => useContext(SessionCtx);
