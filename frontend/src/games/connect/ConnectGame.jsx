// Yas Connect — interface. Toute la logique (validité, victoire) est côté serveur.
import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { TimerBar } from '../../components/ui';

const COLS = 7;
const ROWS = 6;
const DISC = { yellow: '#FFD100', blue: '#5F99D2' };

export default function ConnectGame({ snapshot, me, sendAction }) {
  const v = snapshot.view;
  const [hover, setHover] = useState(null);
  const myTurn = v.status === 'playing' && v.turn === me;
  const players = snapshot.players;
  const byId = Object.fromEntries(players.map(p => [p.userId, p]));
  const win = new Set((v.winLine || []).map(([r, c]) => `${r}-${c}`));
  const last = v.lastMove;

  function play(col) {
    if (!myTurn) return;
    if (v.board[ROWS - 1][col] !== null) return;
    sendAction({ type: 'drop', col });
  }

  const playerBox = (userId) => {
    const p = byId[userId];
    const active = v.turn === userId;
    return (
      <div className="card tight row" style={{ flex: 1, gap: 8, boxShadow: active ? '0 0 0 3px var(--yas-blue)' : undefined, opacity: p?.connected === false ? 0.6 : 1 }}>
        <Avatar id={p?.avatar} size={36} online={p?.connected} />
        <div className="grow">
          <div className="bold small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userId === me ? 'Moi' : p?.username}</div>
          <div className="row tiny" style={{ gap: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: DISC[v.colors[userId]], border: '1.5px solid #00377D' }} />
            {v.colors[userId] === 'yellow' ? 'Jaune' : 'Bleu'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>{v.players.map(u => <div key={u} style={{ flex: 1, display: 'flex' }}>{playerBox(u)}</div>)}</div>
      <div className="center bold" aria-live="polite">
        {v.status === 'finished' ? (v.winner ? `${v.winner === me ? 'Tu as' : `${byId[v.winner]?.username} a`} aligné 4 jetons !` : 'Grille pleine : match nul')
          : myTurn ? 'À toi de jouer !' : `Au tour de ${byId[v.turn]?.username}…`}
      </div>
      {v.status === 'playing' && <TimerBar deadline={v.turnDeadline} total={v.turnMs || 20000} />}

      <div style={{ background: 'var(--yas-blue)', borderRadius: 20, padding: 8, boxShadow: 'var(--yas-shadow-card)', touchAction: 'manipulation' }}
        role="grid" aria-label="Grille de Yas Connect">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 0 }}>
          {Array.from({ length: COLS }, (_, c) => {
            const full = v.board[ROWS - 1][c] !== null;
            return (
              <button key={c} onClick={() => play(c)} disabled={!myTurn || full}
                onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
                aria-label={`Colonne ${c + 1}${full ? ' (pleine)' : ''}`}
                style={{ display: 'flex', flexDirection: 'column-reverse', gap: 0, padding: '2px 0', borderRadius: 12,
                  background: myTurn && hover === c && !full ? 'rgba(255,255,255,.12)' : 'transparent', cursor: myTurn && !full ? 'pointer' : 'default' }}>
                {Array.from({ length: ROWS }, (_, r) => {
                  const cell = v.board[r][c];
                  const isLast = last && last.row === r && last.col === c;
                  const isWin = win.has(`${r}-${c}`);
                  return (
                    <span key={r} style={{ display: 'block', padding: '7%' }}>
                      <span style={{
                        display: 'block', aspectRatio: '1', borderRadius: '50%',
                        background: cell ? DISC[cell] : '#002a60',
                        boxShadow: cell ? 'inset 0 -4px 0 rgba(0,0,0,.18)' : 'inset 0 3px 6px rgba(0,0,0,.45)',
                        outline: isWin ? '3px solid #fff' : 'none',
                        animation: isLast ? `drop-${ROWS - r} .35s cubic-bezier(.4,0,.6,1.3)` : isWin ? 'win-pulse .9s ease-in-out infinite' : undefined,
                      }} />
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>
      <style>{Array.from({ length: ROWS }, (_, i) => `@keyframes drop-${i + 1} { from { transform: translateY(-${(i + 1) * 110}%); } to { transform: none; } }`).join('\n')
        + '\n@keyframes win-pulse { 50% { transform: scale(.85); } }'}</style>
      <p className="tiny muted center">{v.moveCount} coup(s) joué(s)</p>
    </div>
  );
}
