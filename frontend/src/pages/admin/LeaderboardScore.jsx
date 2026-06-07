import { useEffect, useState } from 'react';
import api from '../../utils/api';

export default function LeaderboardScore() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/admin/leaderboard/score')
      .then(r => setRows(r.data.leaderboard))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser le classement ? Toutes les sessions et réponses seront supprimées définitivement.')) return;
    setResetting(true);
    try {
      await api.delete('/admin/leaderboard/reset');
      setRows([]);
    } catch (e) {
      alert('Erreur : ' + (e.response?.data?.error || e.message));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>🏆 Classement par Score</h2>
        <button onClick={handleReset} disabled={resetting} style={styles.resetBtn}>
          {resetting ? 'Réinitialisation…' : '🗑 Réinitialiser le classement'}
        </button>
      </div>
      {loading ? <p style={styles.loading}>Chargement...</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['#', 'Nom', 'Téléphone', 'Score', 'Bonnes rép.', 'Vitesse moy.', 'Dernière session'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={i % 2 === 0 ? styles.trEven : {}}>
                  <td style={styles.td}>
                    <span style={{ ...styles.rank, background: i === 0 ? '#FFD100' : i === 1 ? '#e2e8f0' : i === 2 ? '#fde68a' : '#f1f5f9' }}>
                      {i + 1}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{r.name || '—'}</td>
                  <td style={styles.td}>{r.phone}</td>
                  <td style={{ ...styles.td, fontFamily: "'Figtree', sans-serif", fontSize: 20, color: '#00377D' }}>{r.best_score}</td>
                  <td style={styles.td}>{r.total_correct}</td>
                  <td style={styles.td}>{r.best_speed_ms ? `${(r.best_speed_ms / 1000).toFixed(1)}s` : '—'}</td>
                  <td style={styles.td}>{r.last_session ? new Date(r.last_session).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p style={styles.empty}>Aucune donnée disponible</p>}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  title: { fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', color: '#00377D', letterSpacing: 2, margin: 0 },
  resetBtn: { background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  loading: { color: '#64748b' },
  tableWrap: { background: 'white', borderRadius: 16, overflow: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#6b7280', background: '#f9fafb', whiteSpace: 'nowrap' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderTop: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  trEven: { background: '#fafbff' },
  rank: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', fontWeight: 800, fontSize: 13 },
  empty: { textAlign: 'center', padding: 32, color: '#9ca3af' },
};
