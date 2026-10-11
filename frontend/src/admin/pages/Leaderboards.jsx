import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Head, GameSelect, ExportButtons, DataTable, fmt, Loading, ErrorBox, GAME_NAMES } from '../ui';

const PERIODS = [['week', 'Cette semaine'], ['month', 'Ce mois'], ['season', 'Saison'], ['all', 'Historique']];

export function Leaderboards() {
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const [gameId, setGameId] = useState(null);
  const [period, setPeriod] = useState('season');
  const [board, setBoard] = useState('rating');
  const [data, setData] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [season, setSeason] = useState({ name: '', startsAt: '', endsAt: '' });
  const params = { gameId: gameId || undefined, period, board: gameId === 'penalty' ? board : undefined, limit: 500 };
  const load = () => {
    api.get('/admin/leaderboards', { params }).then(r => setData(r.data)).catch(e => setError(adminError(e)));
    api.get('/admin/seasons').then(r => setSeasons(r.data.seasons)).catch(() => {});
  };
  useEffect(load, [gameId, period, board]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recalc() {
    if (!window.confirm('Recalculer les agrégats (XP, niveaux, parties, victoires) depuis les grands livres ?')) return;
    try { const { data: r } = await api.post('/admin/leaderboards/recalculate', { reason: 'Recalcul manuel' }); setMsg(`Recalcul terminé (${r.players} joueurs).`); load(); } catch (e) { setMsg(adminError(e)); }
  }
  async function newSeason(e) {
    e.preventDefault();
    if (!window.confirm('Clôturer la saison active et en ouvrir une nouvelle ?')) return;
    try { await api.post('/admin/seasons', season); setMsg('Nouvelle saison ouverte.'); setSeason({ name: '', startsAt: '', endsAt: '' }); load(); } catch (e2) { setMsg(adminError(e2)); }
  }

  return (
    <div className="stack lg">
      <Head title="Classements & saisons" sub="Global = points de saison ; par jeu = cote compétitive. Toute correction est journalisée.">
        <ExportButtons path="/admin/leaderboards" params={params} />
        {can('leaderboards.recalculate') && <button className="btn sm blue" onClick={recalc}>Recalculer</button>}
      </Head>
      {msg && <div className="alert info">{msg}</div>}
      <div className="filters">
        <GameSelect value={gameId} onChange={setGameId} allLabel="Tous les jeux (points)" />
        <select className="adm-input" value={period} onChange={e => setPeriod(e.target.value)} aria-label="Période">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {gameId === 'penalty' && <select className="adm-input" value={board} onChange={e => setBoard(e.target.value)} aria-label="Classement"><option value="rating">Meilleurs joueurs</option><option value="scorers">Meilleurs buteurs</option><option value="keepers">Meilleurs gardiens</option></select>}
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <DataTable rows={data.entries} onRowClick={(r) => navigate(`/admin/users/${r.userId}`)} columns={[
          { key: 'rank', label: '#', num: true }, { key: 'username', label: 'Pseudonyme', render: r => <b>{r.username}</b> },
          { key: 'value', label: gameId ? (board === 'keepers' ? '% arrêts' : board === 'scorers' ? 'Buts' : 'Cote') : 'Points', num: true, render: r => fmt.n(r.value) },
          { key: 'league', label: 'Ligue' }, { key: 'wins', label: 'Victoires', num: true }, { key: 'matches', label: 'Parties', num: true },
          { key: 'winRate', label: 'Taux', num: true, render: r => fmt.pct(r.winRate) },
        ]} />
      )}
      <div className="panel">
        <h2>Historique des saisons</h2>
        <DataTable rows={seasons} empty="Aucune saison." columns={[
          { key: 'name', label: 'Saison', render: r => <b>{r.name}{r.is_active ? ' (active)' : ''}</b> },
          { key: 'starts_at', label: 'Début', render: r => fmt.date(r.starts_at) }, { key: 'ends_at', label: 'Fin', render: r => fmt.date(r.ends_at) },
          { key: 'players', label: 'Joueurs classés', num: true },
          { key: 'podium', label: 'Podium', render: r => (r.podium || []).map((p, i) => `${i + 1}. ${p.username} (${p.points})`).join(' · ') || '—' },
        ]} />
        {can('seasons.manage') && (
          <form className="row wrap" style={{ gap: 8, marginTop: 12 }} onSubmit={newSeason}>
            <input className="adm-input" placeholder="Nom (ex. Saison 2)" value={season.name} onChange={e => setSeason(s => ({ ...s, name: e.target.value }))} required />
            <input className="adm-input" type="date" value={season.startsAt} onChange={e => setSeason(s => ({ ...s, startsAt: e.target.value }))} required aria-label="Début" />
            <input className="adm-input" type="date" value={season.endsAt} onChange={e => setSeason(s => ({ ...s, endsAt: e.target.value }))} required aria-label="Fin" />
            <button className="btn sm">Ouvrir une nouvelle saison</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function Review() {
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.get('/admin/matches/review', { params: { status } }).then(r => setList(r.data.matches)).catch(e => setError(adminError(e)));
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function decide(id, decision) {
    const reason = window.prompt(decision === 'void' ? 'Motif de l\'annulation (points, XP et cotes seront compensés) :' : 'Motif de la validation :');
    if (!reason) return;
    try { await api.post(`/admin/matches/${id}/review`, { decision, reason }); setDetail(null); load(); } catch (e) { alert(adminError(e)); }
  }
  return (
    <div className="stack lg">
      <Head title="Résultats suspects" sub="Matchs signalés automatiquement (ex. nombreuses victoires du même joueur contre le même adversaire en 24 h)." />
      <div className="tabs">{[['pending', 'À examiner'], ['cleared', 'Validés'], ['voided', 'Annulés']].map(([k, l]) => <button key={k} className={`tab${status === k ? ' active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <ErrorBox error={error} />
      {!list ? <Loading /> : (
        <DataTable rows={list} empty="Rien à examiner." onRowClick={(r) => api.get(`/admin/matches/${r.id}`).then(x => setDetail(x.data))} columns={[
          { key: 'ended_at', label: 'Date', render: r => fmt.dt(r.ended_at) }, { key: 'game_id', label: 'Jeu', render: r => GAME_NAMES[r.game_id] },
          { key: 'players', label: 'Joueurs', render: r => (r.players || []).map(p => `${p.username} (${p.outcome})`).join(' vs ') },
          { key: 'flags', label: 'Alerte', render: r => (r.flags || []).map(f => f.detail).join(' ; ') },
          ...(status === 'pending' ? [{ key: 'x', label: '', render: r => (
            <span className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
              <button className="btn sm outline" onClick={() => decide(r.id, 'clear')}>Valider</button>
              <button className="btn sm danger" onClick={() => decide(r.id, 'void')}>Annuler</button>
            </span>) }] : []),
        ]} />
      )}
      {detail && (
        <div className="panel">
          <h2>Détail du match {detail.match.id.slice(0, 8)} — {detail.events.length} événements enregistrés</h2>
          <DataTable rows={detail.events.slice(-60)} columns={[
            { key: 'seq', label: '#', num: true }, { key: 'created_at', label: 'Heure', render: r => new Date(r.created_at).toLocaleTimeString('fr-FR') },
            { key: 'username', label: 'Joueur' }, { key: 'type', label: 'Type' },
            { key: 'payload', label: 'Détail', render: r => <code className="tiny">{JSON.stringify(r.payload).slice(0, 120)}</code> },
          ]} />
        </div>
      )}
    </div>
  );
}
