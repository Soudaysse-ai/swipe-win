import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { Head, DateRange, useRange, GameSelect, ExportButtons, DataTable, Pager, fmt, Loading, ErrorBox, StatusDot } from '../ui';

const METRICS = [
  ['matches', 'Parties'], ['playtime', 'Temps de jeu'], ['wins', 'Victoires'], ['points', 'Points'],
  ['xp', 'XP'], ['winrate', 'Taux de victoire'], ['regularity', 'Régularité'],
];

export default function TopPlayers() {
  const navigate = useNavigate();
  const [range, setRange] = useRange(30);
  const [metric, setMetric] = useState('matches');
  const [gameId, setGameId] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const params = { ...range, metric, gameId: gameId || undefined, q: q || undefined, sort: sort?.key, dir: sort?.dir, page, pageSize: 25 };

  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/admin/players/top', { params }).then(r => { setData(r.data); setError(null); }).catch(e => setError(adminError(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSort = (key) => { setPage(1); setSort(s => ({ key, dir: s?.key === key && s.dir === 'desc' ? 'asc' : 'desc' })); };
  const columns = [
    { key: 'rank', label: '#', num: true, sortKey: false },
    { key: 'username', label: 'Pseudonyme', render: r => <b>{r.username}</b> },
    { key: 'status', label: 'Statut', sortKey: false, render: r => <StatusDot status={r.status} /> },
    { key: 'matches', label: 'Parties', num: true, render: r => fmt.n(r.matches) },
    { key: 'wins', label: 'Victoires', num: true, render: r => fmt.n(r.wins) },
    { key: 'win_rate', label: 'Taux', num: true, render: r => fmt.pct(r.win_rate) },
    { key: 'play_time_ms', label: 'Temps de jeu', num: true, render: r => fmt.dur(r.play_time_ms) },
    { key: 'points', label: 'Points', num: true, render: r => fmt.n(r.points) },
    { key: 'xp', label: 'XP (total)', num: true, render: r => fmt.n(r.xp) },
    { key: 'active_days', label: 'Jours actifs', num: true, render: r => fmt.n(r.active_days) },
  ];

  return (
    <div>
      <Head title="Meilleurs joueurs" sub={data?.metricLabel ? `Classement : ${data.metricLabel}. Seules les parties validées comptent.` : ''}>
        <ExportButtons path="/admin/players/top" params={params} />
      </Head>
      <div className="tabs" style={{ marginBottom: 12 }} role="tablist">
        {METRICS.map(([k, l]) => <button key={k} role="tab" aria-selected={metric === k} className={`tab${metric === k ? ' active' : ''}`} onClick={() => { setMetric(k); setSort(null); setPage(1); }}>{l}</button>)}
      </div>
      <div className="filters">
        <DateRange value={range} onChange={(r) => { setRange(r); setPage(1); }} />
        <GameSelect value={gameId} onChange={(g) => { setGameId(g); setPage(1); }} />
        <input placeholder="Rechercher un pseudonyme" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} aria-label="Recherche" />
      </div>
      {metric === 'winrate' && <div className="alert info" style={{ marginBottom: 12 }}>Minimum 20 parties validées sur la période pour apparaître.</div>}
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          <DataTable columns={columns} rows={data.rows} sort={sort} onSort={onSort} onRowClick={(r) => navigate(`/admin/users/${r.user_id}`)} />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
