import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import YasLogo from '../components/YasLogo';
import Plectre from '../components/Plectre';

export default function Home() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('sw_player');
    if (saved) {
      try { setPlayer(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem('sw_player');
    setPlayer(null);
    setPhone('');
    setAgreed(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim()) return setError('Entrez votre numéro');
    if (!/^4\d{6}$/.test(phone.trim())) return setError('Le numéro doit commencer par 4 et contenir 7 chiffres (ex: 4451200)');
    if (!agreed) return setError('Veuillez accepter les conditions');
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/subscribe', { phone: `+269${phone.trim()}` });
      localStorage.setItem('sw_player', JSON.stringify(data.player));
      navigate('/game');
    } catch {
      setError('Erreur, réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      {/* Plectrum + logo : fixé en haut à droite de la PAGE (pas du frame) */}
      <div style={s.blobWrap}>
        <Plectre color="yellow" size={520} rotate={-35} style={s.blob} />
        <div style={s.logoOnBlob}>
          <YasLogo size={190} />
        </div>
      </div>

      <div style={s.frame}>
        {/* Title */}
        <h1 style={s.title}>
          <span style={s.tYellow}>Swipe </span>
          <span style={s.tBlue}>&amp; gagne&nbsp;!</span>
        </h1>

        {/* White card */}
        {player ? (
          <div style={s.card}>
            <p style={s.label}>Content de te revoir&nbsp;!</p>
            <p style={s.checkText}>{player.phone}</p>
            <button style={s.btn} type="button" onClick={() => navigate('/game')}>
              Jouer
            </button>
            <button style={s.linkBtn} type="button" onClick={handleLogout}>
              Changer de numéro
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={s.card}>
            <label style={s.label}>Numéro de téléphone</label>
            <div style={s.phoneRow}>
              <span style={s.prefix}>+269</span>
              <input
                style={s.phoneInput}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="000 0000"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                maxLength={7}
              />
            </div>

            <label style={s.checkRow}>
              <span
                style={{ ...s.checkbox, ...(agreed ? s.checkboxOn : {}) }}
                onClick={() => setAgreed(v => !v)}
              >{agreed && '✓'}</span>
              <span style={s.checkText}>
                J'accepte les Conditions d'utilisation et la Politique de confidentialité. Je suis prêt à jouer.
              </span>
            </label>

            {error && <p style={s.error}>{error}</p>}

            <button style={{ ...s.btn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }} type="submit" disabled={loading}>
              {loading ? 'Connexion…' : 'Continuer'}
            </button>
          </form>
        )}
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
