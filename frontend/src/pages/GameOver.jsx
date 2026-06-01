import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../utils/api';
import YasLogo from '../components/YasLogo';
import Plectre from '../components/Plectre';

const RADIUS = 72;
const CIRC = 2 * Math.PI * RADIUS;

export default function GameOver() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [prizes, setPrizes] = useState([]);
  const [showPrizes, setShowPrizes] = useState(false);
  const [progress, setProgress] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [rankInfo, setRankInfo] = useState(null);
  const [lbLoading, setLbLoading] = useState(false);
  const session = state?.session || { score: 0, correct_count: 0 };
  const total = state?.total || 15;
  const maxScore = total * 15;

  const player = (() => {
    try { return JSON.parse(localStorage.getItem('sw_player') || 'null'); } catch { return null; }
  })();
  const myId = session.player_id || player?.id;

  function maskPhone(phone) {
    if (!phone) return '';
    return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4) : phone;
  }

  async function toggleLeaderboard() {
    const next = !showLeaderboard;
    setShowLeaderboard(next);
    if (next && leaderboard.length === 0) {
      setLbLoading(true);
      try {
        const [lb, rk] = await Promise.all([
          api.get('/leaderboard'),
          myId ? api.get(`/leaderboard/rank/${myId}`) : Promise.resolve({ data: null }),
        ]);
        setLeaderboard(lb.data.leaderboard || []);
        setRankInfo(rk.data);
      } catch { /* ignore */ }
      finally { setLbLoading(false); }
    }
  }

  useEffect(() => {
    api.get('/prizes/active').then(r => setPrizes(r.data.prizes)).catch(() => {});
    const target = Math.min(session.score / maxScore, 1);
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const e = (ts - start) / 1200;
      const p = Math.min(e, 1);
      setProgress(p * target);
      setDisplayScore(Math.round(p * session.score));
      if (e < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, []);

  const dash = CIRC - progress * CIRC;

  return (
    <div style={s.container}>
      <Plectre color="yellow" size={240} rotate={-30} style={s.plectreTop} />
      <Plectre color="blue" size={200} rotate={150} style={s.plectreBottom} />

      <div style={s.content}>
        <YasLogo size={96} style={{ margin: '0 auto' }} />
        <h1 style={s.title}>Game over&nbsp;!</h1>
        <p style={s.subtitle}>Tu as récolté :</p>

        <div style={s.arcWrap}>
          <svg width="190" height="190" viewBox="0 0 190 190">
            <circle cx="95" cy="95" r={RADIUS} fill="none" stroke="#dbe3f4" strokeWidth="14" />
            <circle
              cx="95" cy="95" r={RADIUS} fill="none"
              stroke="#FFD109" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={dash}
              transform="rotate(-90 95 95)" style={{ transition: 'stroke-dashoffset 0.05s' }}
            />
          </svg>
          <div style={s.arcCenter}>
            <span style={s.arcScore}>{displayScore}</span>
            <span style={s.arcLabel}>points</span>
          </div>
        </div>

        <p style={s.summary}>
          <strong>{session.correct_count}</strong> bonne{session.correct_count > 1 ? 's' : ''} réponse{session.correct_count > 1 ? 's' : ''} sur {total}
        </p>
        {session.avg_speed_ms > 0 && (
          <p style={s.speed}>⚡ {(session.avg_speed_ms / 1000).toFixed(1)}s par réponse</p>
        )}

        <div style={s.actions}>
          <button style={s.btnReplay} onClick={() => navigate('/game')}>RE-JOUER →</button>
          <button style={s.btnPrizes} onClick={toggleLeaderboard}>🏆 VOIR LE CLASSEMENT</button>
          {prizes.length > 0 && (
            <button style={s.btnPrizes} onClick={() => setShowPrizes(v => !v)}>VOIR LES PRIX</button>
          )}
          <button style={s.btnHome} onClick={() => navigate('/')}>Retour à l'accueil</button>
        </div>

        {showLeaderboard && (
          <div style={s.lbPanel}>
            {lbLoading ? (
              <p style={s.lbLoading}>Chargement…</p>
            ) : (
              <>
                {rankInfo && rankInfo.rank && (
                  <div style={s.myRank}>
                    <span style={s.myRankLabel}>Ton classement</span>
                    <span style={s.myRankValue}>#{rankInfo.rank} / {rankInfo.total_players}</span>
                    <span style={s.myRankScore}>Meilleur score : {rankInfo.best_score} pts</span>
                  </div>
                )}
                <div style={s.lbList}>
                  {leaderboard.map((row, i) => {
                    const isMe = row.id === myId;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                    return (
                      <div key={row.id} style={{ ...s.lbRow, ...(isMe ? s.lbRowMe : {}) }}>
                        <span style={s.lbPos}>{medal}</span>
                        <span style={s.lbName}>{row.name || maskPhone(row.phone)}{isMe ? ' (toi)' : ''}</span>
                        <span style={s.lbScore}>{row.best_score} pts</span>
                      </div>
                    );
                  })}
                  {leaderboard.length === 0 && <p style={s.lbLoading}>Aucun classement pour le moment.</p>}
                </div>
              </>
            )}
          </div>
        )}

        {showPrizes && prizes.length > 0 && (
          <div style={s.prizeGrid}>
            {prizes.map(p => (
              <div key={p.id} style={s.prizeItem}>
                {p.image_url ? <img src={p.image_url} alt={p.label} style={s.prizeImg} /> : <div style={s.prizeEmoji}>🏆</div>}
                <div>
                  <span style={s.prizeTier}>{p.tier.toUpperCase()}</span>
                  <div style={s.prizeLabel}>{p.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: '#F0F4FF', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'center' },
  plectreTop: { position: 'absolute', top: -80, left: -70, opacity: 0.1, pointerEvents: 'none' },
  plectreBottom: { position: 'absolute', bottom: -60, right: -60, opacity: 0.1, pointerEvents: 'none' },
  content: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, padding: '40px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  title: { fontFamily: "'Figtree', sans-serif", fontWeight: 900, fontStyle: 'italic', fontSize: 48, color: '#00377D', margin: 0, lineHeight: 1 },
  subtitle: { color: '#7da7d9', fontStyle: 'italic', fontWeight: 700, fontSize: 18, margin: 0 },
  arcWrap: { position: 'relative', width: 190, height: 190, margin: '8px 0' },
  arcCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  arcScore: { fontWeight: 900, fontSize: 54, color: '#00377D', lineHeight: 1 },
  arcLabel: { fontSize: 15, color: '#64748b', fontWeight: 800 },
  summary: { fontSize: 18, color: '#00377D', fontWeight: 800, margin: 0 },
  speed: { fontSize: 14, color: '#64748b', margin: 0, fontWeight: 600 },
  actions: { width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 },
  btnReplay: {
    padding: '16px', borderRadius: 50, border: 'none', background: '#FFD109', color: '#00377D',
    fontWeight: 900, fontSize: 17, letterSpacing: 0.5, cursor: 'pointer', fontFamily: "'Figtree', sans-serif",
    boxShadow: '0 6px 18px rgba(255,209,9,0.4)',
  },
  btnPrizes: { padding: '14px', borderRadius: 50, border: '2px solid #00377D', background: 'white', color: '#00377D', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  btnHome: { padding: '10px', border: 'none', background: 'none', color: '#94a3b8', fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' },
  prizeGrid: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  prizeItem: { background: 'white', borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  prizeImg: { width: 50, height: 50, objectFit: 'contain', borderRadius: 8 },
  prizeEmoji: { fontSize: 38 },
  prizeTier: { fontSize: 10, fontWeight: 800, color: '#FFD109', background: '#00377D', borderRadius: 4, padding: '2px 6px' },
  prizeLabel: { fontWeight: 800, color: '#00377D', fontSize: 15, marginTop: 4 },
  lbPanel: { width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 },
  lbLoading: { textAlign: 'center', color: '#64748b', fontWeight: 700, fontSize: 14 },
  myRank: { background: '#00377D', borderRadius: 16, padding: '14px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  myRankLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 800, letterSpacing: 1 },
  myRankValue: { color: '#FFD109', fontSize: 30, fontWeight: 900, lineHeight: 1.1 },
  myRankScore: { color: 'white', fontSize: 13, fontWeight: 700 },
  lbList: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6 },
  lbRow: { background: 'white', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' },
  lbRowMe: { background: '#FFF7D6', border: '2px solid #FFD109' },
  lbPos: { fontWeight: 900, fontSize: 16, color: '#00377D', width: 30, textAlign: 'center', flexShrink: 0 },
  lbName: { flex: 1, fontWeight: 700, color: '#1a2238', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lbScore: { fontWeight: 900, color: '#00377D', fontSize: 15, flexShrink: 0 },
};
