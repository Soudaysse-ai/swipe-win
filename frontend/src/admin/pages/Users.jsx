import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import Avatar from '../../components/Avatar';
import { Head, ExportButtons, DataTable, Pager, fmt, Loading, ErrorBox, StatusDot, Kpi, GAME_NAMES } from '../ui';

export function Users() {
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const params = { q: q || undefined, status: status || undefined, from: range.from || undefined, to: range.to || undefined, sort: sort.key, dir: sort.dir, page, pageSize: 25 };
  useEffect(() => {
    const t = setTimeout(() => api.get('/admin/players', { params }).then(r => { setData(r.data); setError(null); }).catch(e => setError(adminError(e))), 200);
    return () => clearTimeout(t);
  }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'username', label: 'Pseudonyme', render: r => <span className="row" style={{ gap: 8 }}><Avatar id={r.avatar} size={26} /><b>{r.username}</b></span> },
    ...(can('players.view_private') ? [{ key: 'phone', label: 'Téléphone', sortKey: false }, { key: 'email', label: 'E-mail', sortKey: false }] : []),
    { key: 'status', label: 'Statut', sortKey: false, render: r => <StatusDot status={r.status} /> },
    { key: 'created_at', label: 'Inscription', render: r => fmt.date(r.created_at) },
    { key: 'last_seen_at', label: 'Dernière activité', render: r => fmt.dt(r.last_seen_at) },
    { key: 'xp', label: 'XP', num: true, render: r => `${fmt.n(r.xp)} (niv. ${r.level})` },
    { key: 'matches', label: 'Parties', num: true, render: r => fmt.n(r.matches) },
    { key: 'open_reports', label: 'Signalements', num: true, sortKey: false, render: r => (r.open_reports ? <b style={{ color: '#B42A28' }}>{r.open_reports}</b> : '0') },
  ];
  return (
    <div>
      <Head title="Utilisateurs" sub="Recherche, consultation et gestion des comptes joueurs.">
        <ExportButtons path="/admin/players" params={params} />
      </Head>
      <div className="filters">
        <input placeholder={can('players.view_private') ? 'Pseudonyme, téléphone ou e-mail' : 'Pseudonyme'} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} aria-label="Recherche" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} aria-label="Statut">
          <option value="">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option>
          <option value="banned">Bannis</option><option value="deleted">Supprimés</option>
        </select>
        <span className="small">Inscrits du</span>
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} aria-label="Inscrits depuis" />
        <span className="small">au</span>
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} aria-label="Inscrits jusqu'au" />
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          <DataTable columns={columns} rows={data.rows} sort={sort}
            onSort={(key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
            onRowClick={(r) => navigate(`/admin/users/${r.id}`)} empty="Aucun utilisateur." />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function ActionForm({ action, onDone, playerId }) {
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [extra, setExtra] = useState({ kind: 'season_points', amount: '', gameId: 'connect' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const LABEL = { suspend: 'Suspendre', reactivate: 'Réactiver', ban: 'Bannir', warn: 'Avertir', anonymize: 'Supprimer / anonymiser', 'reset-link': 'Envoyer un lien de réinitialisation', adjust: 'Corriger le score' };
  async function submit(e) {
    e.preventDefault();
    if (['ban', 'anonymize'].includes(action) && !window.confirm(`Confirmer : ${LABEL[action]} ? Cette action est journalisée.`)) return;
    setBusy(true); setMsg(null);
    try {
      const body = { reason, ...(action === 'suspend' && until ? { until: new Date(until).toISOString() } : {}), ...(action === 'adjust' ? extra : {}) };
      const { data } = await api.post(`/admin/players/${playerId}/${action}`, body);
      if (action === 'reset-link') {
        setMsg(data.emailed
          ? `Lien envoyé par e-mail à ${data.email} (valable ${data.expiresInMinutes} min).`
          : `Le joueur n'a pas d'e-mail : transmets-lui ce lien (valable ${data.expiresInMinutes} min, usage unique) : ${data.link}`);
      }
      else { setMsg('Action effectuée et journalisée.'); onDone(); }
    } catch (err) { setMsg(adminError(err)); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit}>
      {action === 'suspend' && <label className="small">Fin de la suspension (vide = indéterminée)<input type="datetime-local" className="adm-input full" value={until} onChange={e => setUntil(e.target.value)} /></label>}
      {action === 'adjust' && (
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="adm-input" value={extra.kind} onChange={e => setExtra(x => ({ ...x, kind: e.target.value }))}><option value="season_points">Points de saison</option><option value="xp">XP</option></select>
          {extra.kind === 'season_points' && <select className="adm-input" value={extra.gameId} onChange={e => setExtra(x => ({ ...x, gameId: e.target.value }))}>{Object.entries(GAME_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
          <input className="adm-input" type="number" placeholder="+/- montant" value={extra.amount} onChange={e => setExtra(x => ({ ...x, amount: e.target.value }))} />
        </div>
      )}
      <textarea className="adm-input full" rows={2} placeholder="Motif (obligatoire, inscrit au journal d'audit)" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} />
      <button className={`btn sm ${['ban', 'anonymize'].includes(action) ? 'danger' : 'blue'}`} disabled={busy}>{LABEL[action]}</button>
      {msg && <div className="alert info">{msg}</div>}
    </form>
  );
}

export function UserDetail() {
  const { id } = useParams();
  const { can } = useAdminAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null);
  const load = () => api.get(`/admin/players/${id}`).then(r => setData(r.data)).catch(e => setError(adminError(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const p = data.player;
  const actions = [
    can('players.moderate') && p.status === 'active' && 'warn',
    can('players.moderate') && p.status === 'active' && 'suspend',
    can('players.moderate') && ['suspended', 'banned'].includes(p.status) && 'reactivate',
    can('players.ban') && p.status !== 'banned' && p.status !== 'deleted' && 'ban',
    can('players.moderate') && p.status !== 'deleted' && 'reset-link',
    can('leaderboards.correct') && 'adjust',
    can('players.anonymize') && p.status !== 'deleted' && 'anonymize',
  ].filter(Boolean);
  const LABEL = { warn: 'Avertir', suspend: 'Suspendre', reactivate: 'Réactiver', ban: 'Bannir', 'reset-link': 'Réinitialiser le mot de passe', adjust: 'Corriger le score', anonymize: 'Anonymiser' };

  return (
    <div className="stack lg">
      <Link to="/admin/users" className="link small" style={{ alignSelf: 'flex-start' }}>Utilisateurs</Link>
      <div className="row" style={{ gap: 14 }}>
        <Avatar id={p.avatar} size={64} />
        <div><h1 className="h2">{p.username}</h1><div className="row small" style={{ gap: 10 }}><StatusDot status={p.status} />{p.suspended_until && <span>jusqu'au {fmt.dt(p.suspended_until)}</span>}</div></div>
      </div>
      <div className="adm-grid k4">
        <Kpi label="Parties" value={fmt.n(p.matches_played)} />
        <Kpi label="Victoires" value={fmt.n(p.wins)} />
        <Kpi label="Temps de jeu" value={fmt.dur(p.play_time_ms)} />
        <Kpi label="Points de saison" value={fmt.n(p.seasonPoints)} />
        <Kpi label="XP / niveau" value={`${fmt.n(p.xp)} · niv. ${p.level}`} />
        <Kpi label="Jours actifs" value={fmt.n(p.active_days)} />
      </div>
      <div className="adm-grid c2">
        <div className="panel">
          <h2>Identité</h2>
          <dl className="kv">
            <dt>Identifiant</dt><dd className="small">{p.id}</dd>
            {data.canViewPrivate && <><dt>Téléphone</dt><dd>{p.phone}</dd><dt>E-mail</dt><dd>{p.email || 'aucun'}</dd></>}
            <dt>Inscription</dt><dd>{fmt.dt(p.created_at)}</dd>
            <dt>Dernière activité</dt><dd>{fmt.dt(p.last_seen_at)}</dd>
            <dt>Historique quiz</dt><dd>{data.legacyQuiz ? `${data.legacyQuiz.sessions} sessions, meilleur score ${data.legacyQuiz.best ?? '—'}` : 'aucun'}</dd>
          </dl>
        </div>
        <div className="panel">
          <h2>Actions</h2>
          {!actions.length && <p className="small muted">Votre rôle ne permet aucune action sur ce compte.</p>}
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {actions.map(a => <button key={a} className={`tab${action === a ? ' active' : ''}`} onClick={() => setAction(a)}>{LABEL[a]}</button>)}
          </div>
          {action && <ActionForm key={action} action={action} playerId={p.id} onDone={load} />}
        </div>
      </div>
      <div className="panel">
        <h2>Cotes et statistiques par jeu</h2>
        <DataTable rows={data.games} columns={[
          { key: 'name', label: 'Jeu' }, { key: 'rating', label: 'Cote', num: true }, { key: 'league', label: 'Ligue' },
          { key: 'played', label: 'Parties', num: true }, { key: 'wins', label: 'Victoires', num: true }, { key: 'losses', label: 'Défaites', num: true },
          { key: 'draws', label: 'Nuls', num: true }, { key: 'winRate', label: 'Taux', num: true, render: r => fmt.pct(r.winRate) },
          { key: 'bestStreak', label: 'Série max', num: true },
        ]} />
      </div>
      <div className="panel">
        <h2>Historique des matchs (50 derniers)</h2>
        <DataTable rows={data.history} empty="Aucun match." columns={[
          { key: 'endedAt', label: 'Date', render: r => fmt.dt(r.endedAt) }, { key: 'gameId', label: 'Jeu', render: r => GAME_NAMES[r.gameId] },
          { key: 'outcome', label: 'Résultat', render: r => (r.status === 'CANCELLED' ? 'Annulée' : `${r.outcome || '—'}${r.placement ? ` (${r.placement}e)` : ''}`) },
          { key: 'opp', label: 'Adversaires', render: r => r.opponents.map(o => o.username).join(', ') },
          { key: 'ratingDelta', label: 'Δ cote', num: true, render: r => (r.ratingDelta == null ? '—' : `${r.ratingDelta > 0 ? '+' : ''}${r.ratingDelta}`) },
          { key: 'isValid', label: 'Validée', render: r => (r.isValid ? 'oui' : 'non') },
          { key: 'endReason', label: 'Fin' },
        ]} />
      </div>
      <div className="adm-grid c2">
        <div className="panel">
          <h2>Signalements reçus</h2>
          <DataTable rows={data.reports} empty="Aucun signalement." columns={[
            { key: 'created_at', label: 'Date', render: r => fmt.dt(r.created_at) }, { key: 'reporter', label: 'Par' },
            { key: 'reason', label: 'Motif' }, { key: 'status', label: 'Statut' }, { key: 'message', label: 'Message' },
          ]} />
        </div>
        <div className="panel">
          <h2>Historique de modération</h2>
          <DataTable rows={data.moderation} empty="Aucune sanction." columns={[
            { key: 'created_at', label: 'Date', render: r => fmt.dt(r.created_at) }, { key: 'action', label: 'Action' },
            { key: 'reason', label: 'Motif' }, { key: 'admin', label: 'Administrateur' },
          ]} />
        </div>
      </div>
    </div>
  );
}
