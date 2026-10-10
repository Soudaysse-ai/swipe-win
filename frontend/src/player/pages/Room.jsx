import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import { emit } from '../../lib/socket';
import { useSession } from '../SessionContext';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import ChatPanel from '../../components/ChatPanel';
import { BackHeader, Sheet } from '../../components/ui';
import { gameName } from '../../lib/format';

function InviteSheet({ open, onClose, room }) {
  const { toast } = useToast();
  const [friends, setFriends] = useState([]);
  const [sent, setSent] = useState({});
  useEffect(() => {
    if (open) playerApi.get('/friends').then(r => setFriends(r.data.friends)).catch(() => {});
  }, [open]);
  async function invite(f) {
    try {
      await emit('friend:invite', { friendId: f.id, gameId: room.gameId });
      setSent(s => ({ ...s, [f.id]: true }));
    } catch (err) { toast(err.message); }
  }
  const inRoom = new Set(room.players.map(p => p.userId));
  return (
    <Sheet open={open} onClose={onClose} label="Inviter des amis">
      <h2 className="h3" style={{ marginBottom: 12 }}>Inviter des amis</h2>
      {!friends.length && <p className="small muted">Ajoute des amis depuis l'onglet Amis pour les inviter.</p>}
      <div className="list" style={{ boxShadow: 'none' }}>
        {friends.filter(f => !inRoom.has(f.id)).map(f => (
          <div key={f.id} className="list-item">
            <Avatar id={f.avatar} size={40} online={f.online} />
            <div className="grow"><div className="title">{f.username}</div><div className="sub">{f.online ? (f.activity ? 'Occupé' : 'En ligne') : 'Hors ligne'}</div></div>
            <button className="btn sm" disabled={sent[f.id]} onClick={() => invite(f)}>{sent[f.id] ? 'Invité ✓' : 'Inviter'}</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export default function Room() {
  const { room, setRoom } = useSession();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!room) return <Navigate to="/games" replace />;
  const me = room.players.find(p => p.userId === user?.id);
  const isHost = room.hostId === user?.id;
  const allReady = room.players.every(p => p.ready);
  const canStart = isHost && room.players.length >= room.minPlayers && allReady && room.status === 'open';

  async function act(event, payload) {
    try { await emit(event, payload); } catch (err) { toast(err.message, { icon: '⚠️' }); }
  }
  async function leave() {
    await act('room:leave');
    setRoom(null);
    navigate(`/games/${room.gameId}`);
  }
  async function share() {
    const text = `Rejoins-moi sur Défi Yas (${gameName(room.gameId)}) ! Code du salon : ${room.code} — ${window.location.origin}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Défi Yas', text });
      else { await navigator.clipboard.writeText(room.code); toast('Code copié !', { icon: '📋' }); }
    } catch { /* partage annulé */ }
  }

  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] || null);

  return (
    <div className="stack" style={{ marginTop: -16 }}>
      <BackHeader title={gameName(room.gameId)} to={`/games/${room.gameId}`} />
      <div className="card stack">
        <div className="row between">
          <span className="chip">{room.visibility === 'public' ? '🌍 Salon public' : room.source === 'tournament' ? '🏆 Tournoi' : '🔒 Salon privé'}</span>
          <span className="small muted">{room.players.length}/{room.maxPlayers} joueurs</span>
        </div>
        <div className="code-box" aria-label={`Code du salon ${room.code}`}>{room.code}</div>
        <div className="row">
          <button className="btn md outline grow" onClick={share}><Icon name="share" size={18} /> Partager</button>
          {room.source !== 'tournament' && <button className="btn md outline grow" onClick={() => setInviteOpen(true)}><Icon name="plus" size={18} /> Inviter</button>}
        </div>
      </div>

      <div className="list">
        {seats.map((p, i) => p ? (
          <div key={p.userId} className={`list-item${p.userId === user?.id ? ' me' : ''}`}>
            <Avatar id={p.avatar} size={44} online={p.connected} />
            <div className="grow">
              <div className="title">{p.username} {p.userId === room.hostId && <span aria-label="hôte">👑</span>}</div>
              <div className="sub">Niveau {p.level}{!p.connected ? ' · déconnecté' : ''}</div>
            </div>
            <span className={`chip ${p.ready ? 'green' : ''}`}>{p.ready ? '✓ Prêt' : 'En attente'}</span>
          </div>
        ) : (
          <div key={`empty-${i}`} className="list-item">
            <span className="avatar" style={{ width: 44, height: 44, background: 'var(--yas-blue-10)', border: '2px dashed var(--yas-blue-35)' }} />
            <div className="grow sub">Place libre</div>
          </div>
        ))}
      </div>

      {room.status === 'in_game' && room.matchId ? (
        <button className="btn block" onClick={() => navigate(`/match/${room.matchId}`)}>Revenir à la partie <span className="arrow" /></button>
      ) : (
        <div className="stack">
          <button className={`btn block${me?.ready ? ' outline' : ''}`} onClick={() => act('room:ready', { ready: !me?.ready })}>
            {me?.ready ? 'Je ne suis plus prêt' : <>Je suis prêt <span className="arrow" /></>}
          </button>
          {isHost && room.maxPlayers > room.minPlayers && (
            <button className="btn block blue" disabled={!canStart} onClick={() => act('room:start')}>Lancer la partie ({room.players.length} joueurs)</button>
          )}
          <p className="tiny muted center">
            {room.players.length < room.minPlayers ? `En attente d'au moins ${room.minPlayers} joueurs…`
              : room.players.length === room.maxPlayers ? 'La partie démarre quand tout le monde est prêt.'
                : isHost ? 'Tu peux lancer quand tout le monde est prêt, ou attendre d\'être au complet.' : 'L\'hôte lancera la partie.'}
          </p>
        </div>
      )}

      <div className="section-title"><h2>Chat</h2></div>
      <ChatPanel roomId={room.id} />

      {room.source !== 'tournament' && <button className="btn block ghost" onClick={leave}>Quitter le salon</button>}
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} room={room} />
    </div>
  );
}
