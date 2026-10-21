// Barre de chat en bas de l'écran de partie (comme Soccer Stars) : champ « Dis
// bonjour… », bouton des réactions et messages rapides, envoi. Les messages reçus
// s'affichent quelques secondes au-dessus de la barre ; l'historique complet
// reste dans la fenêtre de chat. Texte libre filtré par le serveur.
import { useEffect, useRef, useState } from 'react';
import { emit, useSocketEvent } from '../lib/socket';
import { useAuth } from '../player/AuthContext';
import { useToast } from '../player/ToastContext';
import { usePresets } from './ChatPanel';
import Avatar from './Avatar';
import Icon from './Icon';

const SHOW_MS = 4500;

export default function ChatBar({ roomId, onHistory, disabledText }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const presets = usePresets();
  const [text, setText] = useState('');
  const [tray, setTray] = useState(false);
  const [bubbles, setBubbles] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useSocketEvent('chat:message', (m) => {
    if (!roomId || m.roomId !== roomId || m.kind === 'reaction') return;
    setBubbles(list => [...list.slice(-1), m]);
    timers.current.push(setTimeout(() => setBubbles(list => list.filter(x => x.id !== m.id)), SHOW_MS));
  });

  async function send(payload) {
    setTray(false);
    try { await emit('chat:send', { roomId, ...payload }); } catch (err) { toast(err.message, { icon: '💬' }); }
  }
  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    send({ kind: 'text', text: t });
  }

  if (!roomId) {
    return (
      <div className="chat-bar off" role="note">
        <Icon name="chat" size={20} /><span>{disabledText}</span>
      </div>
    );
  }
  return (
    <div className="chat-bar-wrap">
      <div className="chat-bubbles" aria-live="polite">
        {bubbles.map(m => (
          <div key={m.id} className={`chat-bubble${m.userId === user?.id ? ' mine' : ''}`}>
            <Avatar id={m.avatar} size={22} />
            <span><b>{m.userId === user?.id ? 'Moi' : m.username}</b> {m.body}</span>
          </div>
        ))}
      </div>
      {tray && presets && (
        <div className="chat-tray" role="dialog" aria-label="Réactions et messages rapides">
          <div className="chat-tray-emojis">
            {presets.reactions.map(e => <button key={e} type="button" onClick={() => send({ kind: 'reaction', emoji: e })} aria-label={`Réaction ${e}`}>{e}</button>)}
          </div>
          <div className="chat-tray-quick">
            {Object.entries(presets.quick).map(([id, label]) => <button key={id} type="button" onClick={() => send({ kind: 'quick', quickId: id })}>{label}</button>)}
          </div>
        </div>
      )}
      <form className="chat-bar" onSubmit={submit}>
        <button type="button" className="chat-bar-icon history" onClick={onHistory} aria-label="Historique du chat"><Icon name="chat" size={22} /></button>
        <input maxLength={200} placeholder="Dis bonjour…" value={text} onChange={e => setText(e.target.value)} aria-label="Message" enterKeyHint="send" />
        <button type="button" className={`chat-bar-icon${tray ? ' on' : ''}`} onClick={() => setTray(t => !t)} aria-label="Réactions et messages rapides" aria-expanded={tray}>
          <span aria-hidden className="chat-smiley">🙂</span>
        </button>
        <button className="chat-bar-icon send" aria-label="Envoyer" disabled={!text.trim()}><Icon name="arrowRight" size={22} /></button>
      </form>
    </div>
  );
}
