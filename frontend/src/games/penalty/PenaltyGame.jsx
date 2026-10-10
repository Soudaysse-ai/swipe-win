// Yas Penalty — interface (stade 2D léger en SVG, aucune ressource 3D).
// Les choix sont envoyés au serveur, verrouillés et révélés ensemble.
import { useEffect, useState } from 'react';
import Avatar from '../../components/Avatar';
import { TimerBar, Countdown } from '../../components/ui';
import { serverNow } from '../../lib/socket';

const ZONES = {
  1: { x: 88, y: 58, label: 'Haut gauche' },
  2: { x: 88, y: 112, label: 'Bas gauche' },
  3: { x: 150, y: 86, label: 'Centre' },
  4: { x: 212, y: 58, label: 'Haut droite' },
  5: { x: 212, y: 112, label: 'Bas droite' },
};
const SPOT = { x: 150, y: 196 };
const KEEPER = { x: 150, y: 104 };

function ShotDots({ history, userId, suddenDeath }) {
  const mine = history.filter(h => h.shooter === userId);
  const n = Math.max(5, mine.length);
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }} aria-label={`${mine.filter(h => h.goal).length} buts sur ${mine.length} tirs`}>
      {Array.from({ length: suddenDeath ? n : 5 }, (_, i) => {
        const h = mine[i];
        return (
          <span key={i} style={{
            width: 14, height: 14, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
            background: !h ? 'var(--yas-blue-15)' : h.goal ? 'var(--yas-sea-green)' : 'var(--yas-fuscia)', color: '#fff',
          }}>{h ? (h.goal ? '✓' : '✕') : ''}</span>
        );
      })}
    </div>
  );
}

export default function PenaltyGame({ snapshot, me, sendAction }) {
  const v = snapshot.view;
  const k = v.kick;
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const opp = v.players.find(u => u !== me);
  const last = v.lastShot;
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), 200); return () => clearInterval(t); }, []);
  const open = k && now >= k.opensAt;
  const role = k?.myRole;
  const locked = k && k.myChoice != null;
  const showResult = last && (!k || now < k.opensAt);

  const ballPos = showResult ? (last.shot ? ZONES[last.shot] : { x: last.shooter ? 290 : 150, y: 20 }) : SPOT;
  const keeperPos = showResult && last.dive ? ZONES[last.dive] : KEEPER;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="card tight row" style={{ gap: 8 }}>
        {[me, opp].map((u, i) => (
          <div key={u} className="row grow" style={{ gap: 8, flexDirection: i ? 'row-reverse' : 'row', textAlign: i ? 'right' : 'left' }}>
            <Avatar id={byId[u]?.avatar} size={36} online={byId[u]?.connected} />
            <div className="stack" style={{ gap: 3, alignItems: i ? 'flex-end' : 'flex-start', minWidth: 0 }}>
              <span className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{name(u)}</span>
              <ShotDots history={v.history} userId={u} suddenDeath={v.suddenDeath} />
            </div>
          </div>
        ))}
      </div>
      <div className="center" style={{ font: 'italic 800 34px/1 var(--yas-font)' }} aria-label={`Score ${v.score[me]} à ${v.score[opp]}`}>
        {v.score[me]} <span className="muted" style={{ fontSize: 22 }}>–</span> {v.score[opp]}
        {v.suddenDeath && <div className="chip red" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Mort subite</div>}
      </div>

      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--yas-shadow-card)' }}>
        <svg viewBox="0 0 300 220" width="100%" style={{ display: 'block', background: '#3CB167', touchAction: 'manipulation' }} role="group" aria-label="But et zones de tir">
          {[0, 1, 2, 3, 4].map(i => <rect key={i} x="0" y={140 + i * 16} width="300" height="8" fill="rgba(255,255,255,.07)" />)}
          <rect x="0" y="140" width="300" height="80" fill="rgba(0,0,0,.05)" />
          <line x1="10" y1="140" x2="290" y2="140" stroke="#fff" strokeWidth="3" />
          <rect x="40" y="26" width="220" height="114" fill="rgba(255,255,255,.12)" />
          {Array.from({ length: 12 }, (_, i) => <line key={`v${i}`} x1={40 + i * 20} y1="26" x2={40 + i * 20} y2="140" stroke="rgba(255,255,255,.25)" strokeWidth="1" />)}
          {Array.from({ length: 6 }, (_, i) => <line key={`h${i}`} x1="40" y1={26 + i * 20} x2="260" y2={26 + i * 20} stroke="rgba(255,255,255,.25)" strokeWidth="1" />)}
          <path d="M40 140 V26 H260 V140" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
          <ellipse cx={SPOT.x} cy={SPOT.y + 8} rx="6" ry="2.5" fill="rgba(255,255,255,.8)" />

          {/* Gardien */}
          <g style={{ transform: `translate(${keeperPos.x}px, ${keeperPos.y}px)`, transition: 'transform .45s cubic-bezier(.3,1.4,.5,1)' }}>
            <rect x="-15" y="-14" width="30" height="32" rx="10" fill="#FFD100" stroke="#00377D" strokeWidth="2" />
            <circle cx="0" cy="-22" r="9" fill="#FFD100" stroke="#00377D" strokeWidth="2" />
            <rect x="-26" y="-12" width="10" height="7" rx="3.5" fill="#00377D" />
            <rect x="16" y="-12" width="10" height="7" rx="3.5" fill="#00377D" />
          </g>

          {/* Ballon */}
          <g key={showResult ? `b${last.index}` : 'spot'} style={{ transform: `translate(${ballPos.x}px, ${ballPos.y}px)`, transition: showResult ? 'transform .45s ease-out' : 'none' }}>
            <circle r="8" fill="#fff" stroke="#00377D" strokeWidth="1.5" />
            <path d="M-3 -2 l3 -2.5 3 2.5 -1.2 3.5 h-3.6z" fill="#00377D" />
          </g>

          {/* Zones cliquables */}
          {open && !locked && role && Object.entries(ZONES).map(([z, p]) => (
            <g key={z} onClick={() => sendAction({ type: 'choose', zone: Number(z) })} style={{ cursor: 'pointer' }} role="button" aria-label={`${role === 'shooter' ? 'Tirer' : 'Plonger'} : ${p.label}`}>
              <rect x={p.x - 32} y={p.y - 24} width="64" height="48" rx="12" fill={role === 'shooter' ? 'rgba(255,209,0,.35)' : 'rgba(95,153,210,.45)'} stroke="#fff" strokeWidth="2" strokeDasharray="5 4" />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">{role === 'shooter' ? '⚽' : '🧤'}</text>
            </g>
          ))}
          {locked && k && (
            <circle cx={ZONES[k.myChoice].x} cy={ZONES[k.myChoice].y} r="20" fill="none" stroke="#fff" strokeWidth="3" />
          )}
        </svg>
        {showResult && (
          <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
            <span style={{
              font: 'italic 800 40px/1 var(--yas-font)', color: last.goal ? '#FFD100' : '#fff',
              textShadow: '0 3px 0 #00377D, 0 0 12px rgba(0,0,0,.4)', animation: 'pop .4s',
            }}>{last.outcome === 'goal' ? 'BUT !' : last.outcome === 'saved' ? 'ARRÊT !' : 'MANQUÉ !'}</span>
          </div>
        )}
      </div>

      {v.status === 'playing' && k && (
        <div className="card stack" style={{ gap: 8 }}>
          <div className="row between">
            <b>{role === 'shooter' ? '⚽ À toi de tirer' : role === 'keeper' ? '🧤 À toi de plonger' : ''}</b>
            <span className="tiny muted">Tir {Math.floor(k.index / 2) + 1}{v.suddenDeath ? ' (mort subite)' : ' / 5'}</span>
          </div>
          {!open ? <span className="small">Prochain tir dans <Countdown until={k.opensAt} /> s…</span> : (
            <>
              <TimerBar deadline={k.deadline} total={v.decisionMs} />
              <span className="small" aria-live="polite">
                {locked ? `Choix verrouillé (${ZONES[k.myChoice].label}). ${(role === 'shooter' ? k.keeperLocked : k.shooterLocked) ? 'Révélation…' : `En attente de ${name(opp)}…`}`
                  : role === 'shooter' ? 'Touche la zone où tu veux tirer.' : 'Touche la zone où tu veux plonger.'}
              </span>
            </>
          )}
        </div>
      )}
      {last && (
        <p className="tiny muted center">
          Dernier tir : {name(last.shooter)} {last.shot ? `vise ${ZONES[last.shot].label.toLowerCase()}` : 'n\'a pas tiré'}, {name(last.keeper)} {last.dive ? `plonge ${ZONES[last.dive].label.toLowerCase()}` : 'n\'a pas bougé'}.
        </p>
      )}
    </div>
  );
}
