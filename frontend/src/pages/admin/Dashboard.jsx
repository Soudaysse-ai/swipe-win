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

  useEffect(() => {
    api.get('/admin/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={styles.loading}>Chargement...</div>;

  const chartData = (stats?.daily_sessions || []).map(d => ({
    day: d.day?.slice(5) ?? '', // MM-DD
    sessions: parseInt(d.count),
  }));

  return (
    <div>
      <h2 style={styles.pageTitle}>Dashboard</h2>

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
