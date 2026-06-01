import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PlayerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/players/${id}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Chargement...</p>;
  if (!data) return <p>Joueur introuvable</p>;

  const { player, sessions } = data;
  const chartData = [...sessions]
    .filter(s => s.ended_at)
    .reverse()
    .map((s, i) => ({
      session: `S${i + 1}`,
      score: s.score,
      speed: s.avg_speed_ms ? Math.round(s.avg_speed_ms / 100) / 10 : null,
    }));

  return (
    <div>
      <button style={styles.back} onClick={() => navigate('/admin/players')}>← Retour</button>

      <div style={styles.playerCard}>
        <div style={styles.avatar}>{(player.name || player.phone)[0].toUpperCase()}</div>
        <div>
          <h2 style={styles.playerName}>{player.name || '(sans nom)'}</h2>
          <p style={styles.playerPhone}>{player.phone}</p>
          <p style={styles.playerMeta}>
            Inscrit le {new Date(player.subscribed_at).toLocaleDateString('fr-FR')}
            &nbsp;·&nbsp;
            <span style={{ color: player.is_active ? '#22C55E' : '#9ca3af' }}>
              {player.is_active ? '● Actif' : '○ Inactif'}
            </span>
          </p>
        </div>
      </div>

      {/* Stats summary */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statVal}>{sessions.length}</div>
          <div style={styles.statKey}>Sessions</div>
        </div>
        <div style={styles.statBox}>
          <div style={{ ...styles.statVal, color: '#00377D' }}>
            {sessions.length ? Math.max(...sessions.map(s => s.score)) : '—'}
          </div>
          <div style={styles.statKey}>Meilleur score</div>
        </div>
        <div style={styles.statBox}>
          <div style={{ ...styles.statVal, color: '#22C55E' }}>
            {sessions.filter(s => s.avg_speed_ms > 0).length
              ? (sessions.filter(s => s.avg_speed_ms > 0).reduce((a, s) => a + s.avg_speed_ms, 0) /
                sessions.filter(s => s.avg_speed_ms > 0).length / 1000).toFixed(2) + 's'
              : '—'}
          </div>
          <div style={styles.statKey}>Vitesse moy.</div>
        </div>
      </div>

      {/* Score progression chart */}
      {chartData.length > 1 && (
        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>Progression du score</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="session" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#00377D" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sessions history */}
      <h3 style={styles.sectionTitle}>Historique des sessions</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Date', 'Score', 'Bonnes rép.', 'Vitesse moy.', 'Durée'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={s.id} style={i % 2 === 0 ? { background: '#fafbff' } : {}}>
                <td style={styles.td}>{new Date(s.started_at).toLocaleString('fr-FR')}</td>
                <td style={{ ...styles.td, fontFamily: "'Figtree', sans-serif", fontSize: 20, color: '#00377D' }}>{s.score}</td>
                <td style={styles.td}>{s.correct_count}</td>
                <td style={styles.td}>{s.avg_speed_ms ? `${(s.avg_speed_ms / 1000).toFixed(2)}s` : '—'}</td>
                <td style={styles.td}>{s.total_time_ms ? `${(s.total_time_ms / 1000).toFixed(1)}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.length === 0 && <p style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Aucune session</p>}
      </div>
    </div>
  );
}

const styles = {
  back: { padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', marginBottom: 20, fontWeight: 600 },
  playerCard: { background: 'white', borderRadius: 16, padding: 24, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  avatar: { width: 64, height: 64, borderRadius: '50%', background: '#00377D', color: '#FFD100', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, flexShrink: 0 },
  playerName: { fontWeight: 800, fontSize: 22, color: '#111', marginBottom: 4 },
  playerPhone: { color: '#6b7280', fontSize: 15 },
  playerMeta: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 },
  statBox: { background: 'white', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', textAlign: 'center' },
  statVal: { fontFamily: "'Figtree', sans-serif", fontSize: 32, lineHeight: 1 },
  statKey: { fontSize: 12, color: '#6b7280', fontWeight: 700, marginTop: 4 },
  chartBox: { background: 'white', borderRadius: 16, padding: '20px 16px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  chartTitle: { fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 },
  sectionTitle: { fontWeight: 800, fontSize: 16, color: '#374151', marginBottom: 12 },
  tableWrap: { background: 'white', borderRadius: 16, overflow: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#6b7280', background: '#f9fafb' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderTop: '1px solid #f3f4f6' },
};
