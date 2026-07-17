import { useEffect, useState } from 'react';
import api from '../../utils/api';

// Libellés + emoji connus ; les thèmes inconnus s'affichent tels quels
const THEME_META = {
  coupe_du_monde: { label: 'Football / Coupe du Monde', emoji: '⚽', desc: 'Quiz football, Coupe du Monde et règles du jeu.' },
  comores: { label: 'Comores', emoji: '🇰🇲', desc: 'Indépendance, histoire, culture générale et Yas Comores.' },
};

const meta = (key) => THEME_META[key] || { label: key, emoji: '🎯', desc: '' };

export default function AdminThemes() {
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveTheme] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await api.get('/admin/themes');
      setThemes(data.themes);
      setActiveTheme(data.active_theme);
    } finally {
      setLoading(false);
    }
  }

  async function activate(theme) {
    if (theme === activeTheme || saving) return;
    const prev = activeTheme;
    setActiveTheme(theme);
    setSaving(true);
    try {
      await api.put('/admin/settings/active-theme', { theme });
    } catch (e) {
      setActiveTheme(prev); // rollback
      alert('Erreur : ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 style={styles.title}>🎨 Thèmes du jeu</h2>
      <p style={styles.hint}>
        Le thème actif détermine les questions posées aux joueurs. Un seul thème est servi à la fois :
        choisis un thème pour une édition spéciale (ex : fête de l'indépendance) puis reviens au football.
      </p>

      {loading ? <p>Chargement...</p> : (
        <div style={styles.grid}>
          {themes.map(t => {
            const m = meta(t.category);
            const isActive = activeTheme === t.category;
            return (
              <div key={t.category} style={{ ...styles.card, ...(isActive ? styles.cardActive : {}) }}>
                <div style={styles.cardEmoji}>{m.emoji}</div>
                <div style={styles.cardLabel}>{m.label}</div>
                {m.desc && <div style={styles.cardDesc}>{m.desc}</div>}
                <div style={styles.cardMeta}>
                  {t.active_count} question{t.active_count > 1 ? 's' : ''} active{t.active_count > 1 ? 's' : ''}
                  {parseInt(t.total) !== parseInt(t.active_count) && ` (${t.total} au total)`}
                </div>
                {isActive ? (
                  <div style={styles.activeBadge}>✓ Thème actif</div>
                ) : parseInt(t.active_count) === 0 ? (
                  <div style={styles.disabledBadge}>Aucune question active — réactivez-en d'abord</div>
                ) : (
                  <button style={styles.btnActivate} disabled={saving} onClick={() => activate(t.category)}>
                    Activer ce thème
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  title: { fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', color: '#00377D', letterSpacing: 2, marginBottom: 8 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: 640 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 16 },
  card: { background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '2px solid transparent', display: 'flex', flexDirection: 'column', gap: 8 },
  cardActive: { border: '2px solid #FFD100', boxShadow: '0 4px 20px rgba(255,209,0,0.25)' },
  cardEmoji: { fontSize: 40 },
  cardLabel: { fontWeight: 800, fontSize: 17, color: '#00377D' },
  cardDesc: { fontSize: 13, color: '#6b7280', lineHeight: 1.4 },
  cardMeta: { fontSize: 12, color: '#9ca3af', fontWeight: 700 },
  activeBadge: { marginTop: 'auto', alignSelf: 'flex-start', background: '#FFD100', color: '#00377D', fontWeight: 800, fontSize: 13, padding: '8px 16px', borderRadius: 10 },
  btnActivate: { marginTop: 'auto', alignSelf: 'flex-start', background: '#00377D', color: 'white', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer' },
  disabledBadge: { marginTop: 'auto', alignSelf: 'flex-start', background: '#f1f5f9', color: '#94a3b8', fontWeight: 700, fontSize: 12, padding: '8px 16px', borderRadius: 10 },
};
