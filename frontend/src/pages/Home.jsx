import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/playerApi';
import { useAuth } from '../player/AuthContext';
import YasLogo from '../components/YasLogo';
import Plectre from '../components/Plectre';

// Accueil du quiz « Swipe & gagne » (fonctionnalité historique conservée).
// La connexion se fait désormais avec le compte Défi Yas.
export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    api.get('/sessions/game-status').then(r => setPaused(!!r.data.paused)).catch(() => {});
  }, []);

  return (
    <div style={s.page}>
      <div style={s.blobWrap}>
        <Plectre color="yellow" size={520} rotate={-35} style={s.blob} />
        <div style={s.logoOnBlob}>
          <YasLogo size={190} />
        </div>
      </div>

      <div style={s.frame}>
        <h1 style={s.title}>
          <span style={s.tYellow}>Swipe </span>
          <span style={s.tBlue}>&amp; gagne&nbsp;!</span>
        </h1>

        <div style={s.card}>
          <p style={s.label}>Content de te revoir{user ? `, ${user.username}` : ''}&nbsp;!</p>
          <p style={{ ...s.checkText, fontSize: 14, fontWeight: 500 }}>
            15 questions Vrai / Faux sur le football. Glisse à droite pour VRAI, à gauche pour FAUX. Plus tu réponds vite, plus tu marques.
          </p>
          {paused && <p style={s.error}>Le quiz est en pause pour le moment.</p>}
          <button style={{ ...s.btn, opacity: paused ? 0.5 : 1 }} type="button" disabled={paused} onClick={() => navigate('/quiz/play')}>
            Jouer
          </button>
          <button style={s.linkBtn} type="button" onClick={() => navigate('/')}>
            Retour à Défi Yas
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#00377D',
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  frame: {
    position: 'relative',
    width: '100%',
    maxWidth: 460,
    minHeight: '100vh',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 28px',
    zIndex: 1,
  },
  blobWrap: {
    position: 'absolute',
    top: -300,
    right: -170,
    width: 520,
    height: 520,
    pointerEvents: 'none',
    zIndex: 0,
  },
  blob: {
    position: 'absolute',
    top: 0,
    right: 0,
    filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.2))',
  },
  logoOnBlob: {
    position: 'absolute',
    top: 290,
    right: 168,
  },
  title: {
    marginTop: 360,
    marginBottom: 28,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 'clamp(30px, 9vw, 52px)',
    lineHeight: 1.05,
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  tYellow: { color: '#FFD100' },
  tBlue: { color: '#5f99d2' },
  card: {
    background: '#ffffff',
    borderRadius: 22,
    padding: '26px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
    marginBottom: 40,
  },
  label: {
    fontWeight: 800,
    fontSize: 16,
    color: '#1a2238',
  },
  phoneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#eef1f8',
    borderRadius: 14,
    padding: '16px 18px',
  },
  prefix: { fontWeight: 800, fontSize: 18, color: '#1a2238' },
  phoneInput: {
    border: 'none',
    background: 'transparent',
    fontSize: 18,
    outline: 'none',
    flex: 1,
    color: '#64748b',
    fontFamily: 'inherit',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    cursor: 'pointer',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: '2px solid #FFD100',
    flexShrink: 0,
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#00377D',
    fontWeight: 900,
    fontSize: 16,
    background: 'white',
    transition: 'background 0.15s',
  },
  checkboxOn: { background: '#FFD100' },
  checkText: {
    fontSize: 11,
    color: '#1a2238',
    lineHeight: 1.4,
    fontWeight: 700,
  },
  error: { color: '#EF4444', fontSize: 13, margin: 0 },
  btn: {
    width: '100%',
    padding: '18px',
    borderRadius: 14,
    border: 'none',
    background: '#FFD100',
    color: '#00377D',
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 900,
    fontSize: 20,
    cursor: 'pointer',
    marginTop: 4,
  },
  linkBtn: {
    border: 'none',
    background: 'none',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'underline',
    marginTop: 4,
  },
};
