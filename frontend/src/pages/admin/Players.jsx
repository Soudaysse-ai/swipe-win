import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

function exportToExcel(players) {
  // Génère un fichier CSV compatible Excel (avec BOM UTF-8)
  const headers = ['Nom', 'Téléphone', 'Inscrit le', 'Sessions', 'Meilleur score', 'Statut'];
  const rows = players.map(p => [
    p.name || '',
    p.phone,
    new Date(p.subscribed_at).toLocaleDateString('fr-FR'),
    p.sessions_count || 0,
    p.best_score || 0,
    p.is_active ? 'Actif' : 'Inactif',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const bom = '﻿';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `joueurs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPlayers() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/admin/players')
      .then(r => setPlayers(r.data.players))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = players.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  );

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser la liste des joueurs ? Tous les joueurs, sessions et réponses seront supprimés définitivement.')) return;
    setResetting(true);
    try {
      await api.delete('/admin/players/reset');
      setPlayers([]);
    } catch (e) {
      alert('Erreur : ' + (e.response?.data?.error || e.message));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>👥 Joueurs</h2>
        <div style={styles.actions}>
          <input
            style={styles.search}
            placeholder="Rechercher par nom ou téléphone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button style={styles.btnExcel} onClick={() => exportToExcel(filtered)} disabled={filtered.length === 0}>
            📥 Exporter Excel
          </button>
          <button style={styles.btnReset} onClick={handleReset} disabled={resetting}>
            {resetting ? 'Réinitialisation…' : '🗑 Réinitialiser joueurs'}
          </button>
        </div>
      </div>

      {loading ? <p>Chargement...</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Nom', 'Téléphone', 'Inscrit le', 'Sessions', 'Meilleur score', 'Statut', ''].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={i % 2 === 0 ? styles.trEven : {}}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{p.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={styles.td}>{p.phone}</td>
                  <td style={styles.td}>{new Date(p.subscribed_at).toLocaleDateString('fr-FR')}</td>
                  <td style={styles.td}>{p.sessions_count || 0}</td>
                  <td style={{ ...styles.td, fontFamily: "'Figtree', sans-serif", fontSize: 18, color: '#00377D' }}>
                    {p.best_score || '—'}
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: p.is_active ? '#22C55E' : '#9ca3af', fontWeight: 700, fontSize: 13 }}>
                      {p.is_active ? '● Actif' : '○ Inactif'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnDetail} onClick={() => navigate(`/admin/players/${p.id}`)}>
                      Détail →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={styles.empty}>Aucun joueur trouvé</p>}
        </div>
      )}
      {!loading && (
        <p style={styles.count}>{filtered.length} joueur{filtered.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title: { fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', color: '#00377D', letterSpacing: 2, margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  search: { padding: '10px 16px', borderRadius: 10, border: '2px solid #e5e7eb', fontSize: 15, width: 260, outline: 'none' },
  btnExcel: { padding: '10px 18px', borderRadius: 10, border: 'none', background: '#00377D', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnReset: { padding: '10px 18px', borderRadius: 10, border: 'none', background: '#ef4444', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  tableWrap: { background: 'white', borderRadius: 16, overflow: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#6b7280', background: '#f9fafb', whiteSpace: 'nowrap' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderTop: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  trEven: { background: '#fafbff' },
  btnDetail: { padding: '6px 14px', borderRadius: 8, border: '1px solid #00377D', background: 'white', color: '#00377D', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  empty: { textAlign: 'center', padding: 32, color: '#9ca3af' },
  count: { marginTop: 12, color: '#6b7280', fontSize: 13, textAlign: 'right' },
};
