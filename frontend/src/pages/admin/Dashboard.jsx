import { useEffect, useState } from 'react';
import api from '../../utils/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function StatCard({ label, value, sub, color = '#00377D' }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color }}>{value ?? '—'}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gamePaused, setGamePaused] = useState(false);

  useEffect(() => {
    api.get('/admin/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get('/admin/settings/game-paused')
      .then(r => setGamePaused(r.data.paused))
      .catch(() => {});
  }, []);

  async function toggleGamePaused() {
    const next = !gamePaused;
    setGamePaused(next);
    try {
      await api.put('/admin/settings/game-paused', { paused: next });
    } catch {
      setGamePaused(!next); // rollback en cas d'erreur
    }
  }

  if (loading) return <div style={styles.loading}>Chargement...</div>;

  const chartData = (stats?.daily_sessions || []).map(d => ({
    day: d.day?.slice(5) ?? '', // MM-DD
    sessions: parseInt(d.count),
  }));

  return (
    <div>
      <h2 style={styles.pageTitle}>Dashboard</h2>

      <div style={styles.toggleBar}>
        <div>
          <div style={styles.toggleTitle}>⏸ Pause du jeu</div>
          <div style={styles.toggleHint}>
            {gamePaused
              ? 'Le jeu est en pause : les joueurs ne peuvent plus démarrer de nouvelle partie.'
              : 'Le jeu est actif : les joueurs peuvent jouer normalement.'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleGamePaused}
          style={{ ...styles.switch, background: gamePaused ? '#EF4444' : '#22C55E' }}
          aria-label="Mettre le jeu en pause"
        >
          <span style={{ ...styles.switchKnob, transform: gamePaused ? 'translateX(24px)' : 'translateX(0)' }} />
        </button>
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Joueurs inscrits" value={stats?.total_players} color="#00377D" />
        <StatCard label="Sessions aujourd'hui" value={stats?.sessions_today} color="#22C55E" />
        <StatCard label="Sessions cette semaine" value={stats?.sessions_week} color="#0051b8" />
        <StatCard label="Sessions ce mois" value={stats?.sessions_month} color="#6366f1" />
        <StatCard label="Score moyen" value={stats?.avg_score ? `${stats.avg_score} pts` : '—'} color="#FFD100" sub="toutes sessions" />
        <StatCard label="Réponses aujourd'hui" value={stats?.answers_today} color="#EF4444" />
      </div>

      <div style={styles.chartBox}>
        <h3 style={styles.chartTitle}>Sessions par jour (30 derniers jours)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="sessions" stroke="#00377D" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const styles = {
  pageTitle: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 'clamp(24px, 6vw, 32px)',
    color: '#00377D',
    letterSpacing: 2,
    marginBottom: 24,
  },
  toggleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'white', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24 },
  toggleTitle: { fontWeight: 800, fontSize: 15, color: '#00377D' },
  toggleHint: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  switch: { position: 'relative', width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', padding: 0 },
  switchKnob: { position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'transform 0.2s' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 16,
    marginBottom: 28,
  },
  statCard: {
    background: 'white',
    borderRadius: 16,
    padding: '20px 18px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  statValue: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 36,
    lineHeight: 1,
    marginBottom: 4,
  },
  statLabel: { fontSize: 13, color: '#374151', fontWeight: 700 },
  statSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  chartBox: {
    background: 'white',
    borderRadius: 16,
    padding: '20px 16px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#374151',
    marginBottom: 16,
  },
  loading: { color: '#64748b', fontWeight: 600 },
};
