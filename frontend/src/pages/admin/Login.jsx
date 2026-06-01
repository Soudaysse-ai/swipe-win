import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import YasLogo from '../../components/YasLogo';

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/admin');
    } catch {
      setError('Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <YasLogo size={64} />
        <h1 style={styles.title}>SWIPE & WIN</h1>
        <p style={styles.subtitle}>Back-Office Admin</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'SE CONNECTER'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #00377D 0%, #0051b8 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: 'white',
    borderRadius: 24,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  title: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 36,
    color: '#00377D',
    letterSpacing: 3,
    marginTop: 8,
  },
  subtitle: { color: '#64748b', fontSize: 14, fontWeight: 600, marginBottom: 16 },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 700, color: '#374151' },
  input: {
    padding: '12px 16px',
    borderRadius: 12,
    border: '2px solid #e5e7eb',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  btn: {
    padding: '14px',
    borderRadius: 12,
    border: 'none',
    background: '#00377D',
    color: '#FFD100',
    fontFamily: "'Figtree', sans-serif",
    fontSize: 20,
    letterSpacing: 2,
    cursor: 'pointer',
    marginTop: 8,
  },
};
