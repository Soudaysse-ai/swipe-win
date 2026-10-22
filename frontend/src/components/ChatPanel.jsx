// Chat du salon : messages rapides, réactions, texte libre filtré, signalement.
import { useEffect, useRef, useState } from 'react';
import playerApi from '../lib/playerApi';
import { emit, useSocketEvent } from '../lib/socket';
import { useAuth } from '../player/AuthContext';
import { useToast } from '../player/ToastContext';
import Avatar from './Avatar';
import Icon from './Icon';
import { Sheet } from './ui';

let presetsCache = null;

export function usePresets() {
  const [p, setP] = useState(presetsCache);
  useEffect(() => {
    if (presetsCache) return;
    playerApi.get('/chat/presets').then(r => { presetsCache = r.data; setP(r.data); }).catch(() => {});
  }, []);
  return p;
}

export function ReportSheet({ target, onClose }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('insult');
  const [details, setDetails] = useState('');
  if (!target) return null;
  async function send() {
    try {
      await playerApi.post('/reports', { userId: target.userId, reason, details, chatMessageId: target.messageId, matchId: target.matchId });
      toast('Signalement envoyé. Merci !', { icon: '🛡️' });
      onClose();
    } catch { toast('Signalement impossible pour le moment'); }
  }
  async function block() {
    try {
      await playerApi.post(`/blocks/${target.userId}`);
      toast(`${target.username} est bloqué`, { icon: '🚫' });
      onClose();
    } catch { toast('Action impossible'); }
  }
  return (
    <Sheet open onClose={onClose} label="Signaler">
      <div className="stack">
        <h2 className="h3">Signaler {target.username}</h2>
        {target.body && <div className="card flat tight small">« {target.body} »</div>}
        <div className="tabs" style={{ flexWrap: 'wrap' }}>
          {[['insult', 'Insulte'], ['spam', 'Spam'], ['cheating', 'Triche'], ['inappropriate_name', 'Pseudo'], ['other', 'Autre']].map(([v, l]) => (
            <button key={v} className={`tab${reason === v ? ' active' : ''}`} onClick={() => setReason(v)}>{l}</button>
          ))}
        </div>
        <textarea className="card flat" rows={3} maxLength={500} placeholder="Détails (facultatif)" value={details} onChange={e => setDetails(e.target.value)} style={{ resize: 'vertical' }} />
        <button className="btn block" onClick={send}>Envoyer le signalement</button>
        <button className="btn block outline" onClick={block}><Icon name="block" size={18} /> Bloquer ce joueur</button>
      </div>
    </Sheet>
  );
}

export default function ChatPanel({ roomId, matchId, compact = false }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const presets = usePresets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [report, setReport] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!roomId) return;
    emit('chat:history', { roomId }).then(r => setMessages(r.messages)).catch(() => {});
  }, [roomId]);

  useSocketEvent('chat:message', (m) => {
    if (m.roomId !== roomId) return;
    setMessages(list => [...list.slice(-80), m]);
  });

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  async function send(payload) {
    try { await emit('chat:send', { roomId, ...payload }); } catch (err) { toast(err.message, { icon: '💬' }); }
  }

  const visible = messages.filter(m => m.kind !== 'reaction' || !compact);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={listRef} className="card flat" style={{ maxHeight: compact ? 120 : 220, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
        {!visible.length && <span className="tiny muted center">Dis bonjour 👋</span>}
        {visible.map(m => (
          <div key={m.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Avatar id={m.avatar} size={24} />
            <div className="grow small" style={{ lineHeight: 1.3 }}>
              <b>{m.username}</b>{' '}
              <span style={{ fontSize: m.kind === 'reaction' ? 20 : undefined }}>{m.body}</span>
            </div>
            {m.userId !== user?.id && (
              <button className="tiny muted" aria-label={`Signaler ${m.username}`} onClick={() => setReport({ userId: m.userId, username: m.username, messageId: m.id, body: m.body, matchId })}>
                <Icon name="flag" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {presets && (
        <>
          <div className="tabs">
            {presets.reactions.map(e => <button key={e} className="tab" style={{ fontSize: 20, padding: '0 10px' }} onClick={() => send({ kind: 'reaction', emoji: e })} aria-label={`Réaction ${e}`}>{e}</button>)}
          </div>
          <div className="tabs">
            {Object.entries(presets.quick).map(([id, label]) => <button key={id} className="tab" onClick={() => send({ kind: 'quick', quickId: id })}>{label}</button>)}
          </div>
        </>
      )}
      {!compact && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send({ kind: 'text', text }); setText(''); } }}>
          <div className="input-pill grow" style={{ height: 44 }}>
            <input maxLength={200} placeholder="Écris un message…" value={text} onChange={e => setText(e.target.value)} aria-label="Message" />
          </div>
          <button className="icon-btn solid" aria-label="Envoyer"><Icon name="chat" size={20} /></button>
        </form>
      )}
      {report && <ReportSheet target={report} onClose={() => setReport(null)} />}
    </div>
  );
}
