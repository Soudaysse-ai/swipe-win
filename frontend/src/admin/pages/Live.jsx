import { useEffect, useState } from 'react';
import api, { adminError } from '../../utils/api';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Head, Kpi, fmt, DataTable, CategoryBars, GAME_COLORS, GAME_NAMES, Loading, ErrorBox } from '../ui';

export default function Live() {
  const { can } = useAdminAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.get('/admin/realtime').then(r => { setD(r.data); setError(null); }).catch(e => setError(adminError(e)));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  async function cancel(m) {
    const reason = window.prompt('Motif de l\'annulation (journalisé) :');
    if (!reason) return;
    try { await api.post(`/admin/matches/${m.matchId}/cancel`, { reason }); load(); } catch (err) { alert(adminError(err)); }
  }
  return (
    <div>
      <Head title="Activité en direct" sub={d ? `Actualisation automatique toutes les 5 s · serveur démarré depuis ${fmt.dur(d.uptimeSeconds * 1000)} · ${d.memoryMb} Mo` : ''} />
      <ErrorBox error={error} />
      {!d ? <Loading /> : (
        <div className="stack lg">
          <div className="adm-grid k4">
            <Kpi label="Joueurs connectés" value={fmt.n(d.onlineUsers)} />
            <Kpi label="Connexions WebSocket" value={fmt.n(d.sockets.sockets)} />
            <Kpi label="Parties en cours" value={fmt.n(d.liveMatches)} hint={d.reconnecting ? `${d.reconnecting} en reconnexion` : null} />
            <Kpi label="Salons publics ouverts" value={fmt.n(d.publicRooms)} />
            <Kpi label="Salons privés actifs" value={fmt.n(d.privateRooms)} />
            <Kpi label="Latence moyenne (p95)" value={d.sockets.latencyAvgMs != null ? `${d.sockets.latencyAvgMs} ms` : '—'} hint={d.sockets.latencyP95Ms != null ? `p95 : ${d.sockets.latencyP95Ms} ms` : null} />
            <Kpi label="Erreurs (depuis le démarrage)" value={fmt.n(d.sockets.errors)} />
            <Kpi label="Déconnexions (depuis le démarrage)" value={fmt.n(d.sockets.totalDisconnects)} />
          </div>
          <div className="adm-grid c2">
            <CategoryBars title="Parties en cours par jeu" labelKey="name" valueKey="n"
              data={Object.keys(GAME_NAMES).map(g => ({ game: g, name: GAME_NAMES[g], n: d.byGame[g] || 0 }))} colorOf={(x) => GAME_COLORS[x.game]} />
            <CategoryBars title="Files d'attente du matchmaking" labelKey="name" valueKey="n"
              data={Object.keys(GAME_NAMES).map(g => ({ game: g, name: GAME_NAMES[g], n: d.queues[g] || 0 }))} colorOf={(x) => GAME_COLORS[x.game]} />
          </div>
          <div className="panel">
            <h2>Parties en cours</h2>
            <DataTable rows={d.matches} empty="Aucune partie en cours." columns={[
              { key: 'gameId', label: 'Jeu', render: r => GAME_NAMES[r.gameId] },
              { key: 'status', label: 'Statut', render: r => `${r.status}${r.mode === 'bot' ? ' · entraînement' : ''}` },
              { key: 'startedAt', label: 'Début', render: r => (r.startedAt ? fmt.dt(r.startedAt) : 'compte à rebours') },
              { key: 'players', label: 'Joueurs', render: r => r.players.map(p => `${p.username}${p.connected ? '' : ' (déconnecté)'}`).join(', ') },
              { key: 'version', label: 'Actions', num: true },
              ...(can('games.manage') ? [{ key: 'x', label: '', render: r => <button className="btn sm outline" onClick={() => cancel(r)}>Annuler</button> }] : []),
            ]} />
          </div>
          <div className="panel">
            <h2>Salons</h2>
            <DataTable rows={d.rooms} empty="Aucun salon ouvert." columns={[
              { key: 'code', label: 'Code' }, { key: 'gameId', label: 'Jeu', render: r => GAME_NAMES[r.gameId] },
              { key: 'visibility', label: 'Type', render: r => `${r.visibility === 'public' ? 'Public' : 'Privé'} · ${r.source}` },
              { key: 'status', label: 'Statut' }, { key: 'players', label: 'Joueurs', render: r => `${r.players}/${r.maxPlayers}` },
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}
