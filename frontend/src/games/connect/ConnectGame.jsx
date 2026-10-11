// Yas Connect — interface. Toute la logique (validité, victoire) est côté serveur.
import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { TimerBar } from '../../components/ui';

const COLS = 7;
const ROWS = 6;
const DISC = { yellow: '#FFD100', blue: '#5F99D2' };
const RING = { yellow: '#E0AE00', blue: '#3B78B8' };
// Géométrie de la grille dans le repère du SVG.
const CELL = 100;
const PAD = 18;
const DISC_R = 40;
const VB_W = COLS * CELL + PAD * 2;
const VB_H = ROWS * CELL + PAD * 2;

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

      {/* Grille dessinée en SVG (taille fixée par le viewBox) : même rendu sur tous les
          navigateurs, sans dépendre d'aspect-ratio ni de l'étirement des boutons. */}
      <div className="connect-board" role="grid" aria-label="Grille de Yas Connect">
        <div className="connect-frame">
          <svg className="connect-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
            <defs>
              <linearGradient id="cx-hole" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#001B40" /><stop offset=".55" stopColor="#002A60" />
              </linearGradient>
              <linearGradient id="cx-shade" x1="0" y1="0" x2="0" y2="1">
                <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".2" />
              </linearGradient>
            </defs>
            <rect width={VB_W} height={VB_H} rx="48" fill="#00377D" />
            {hover !== null && myTurn && v.board[ROWS - 1][hover] === null && (
              <rect x={PAD + hover * CELL + 4} y={PAD - 6} width={CELL - 8} height={ROWS * CELL + 12} rx="40" fill="#fff" fillOpacity=".12" />
            )}
            {Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => {
              const cell = v.board[r][c];
              const cx = PAD + c * CELL + CELL / 2;
              const cy = PAD + (ROWS - 1 - r) * CELL + CELL / 2;
              const isLast = last && last.row === r && last.col === c;
              const isWin = win.has(`${r}-${c}`);
              if (!cell) return <circle key={`${r}-${c}`} cx={cx} cy={cy} r={DISC_R} fill="url(#cx-hole)" />;
              return (
                <g key={`${r}-${c}${isLast ? `-${v.moveCount}` : ''}`} className={isLast ? `cx-drop cx-drop-${ROWS - r}` : undefined}>
                  <circle cx={cx} cy={cy} r={DISC_R} fill={DISC[cell]} />
                  <circle cx={cx} cy={cy} r={DISC_R * 0.66} fill="none" stroke={RING[cell]} strokeWidth="6" />
                  <circle cx={cx} cy={cy} r={DISC_R} fill="url(#cx-shade)" />
                  {isWin && <circle className="cx-win" cx={cx} cy={cy} r={DISC_R + 5} fill="none" stroke="#fff" strokeWidth="7" />}
                </g>
              );
            }))}
          </svg>
          {Array.from({ length: COLS }, (_, c) => {
            const full = v.board[ROWS - 1][c] !== null;
            return (
              <button key={c} type="button" className="connect-col" onClick={() => play(c)} disabled={!myTurn || full}
                onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
                aria-label={`Colonne ${c + 1}${full ? ' (pleine)' : ''}`}
                style={{ left: `${((PAD + c * CELL) / VB_W) * 100}%`, width: `${(CELL / VB_W) * 100}%`, cursor: myTurn && !full ? 'pointer' : 'default' }} />
            );
          })}
        </div>
      </div>
      <p className="tiny muted center">{v.moveCount} coup(s) joué(s)</p>
    </div>
  );
}
