import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { Head, DataTable, fmt, Loading, ErrorBox, GAME_NAMES } from '../ui';

const STATUS = { draft: 'Brouillon', registration: 'Inscriptions', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé' };
const FORMAT = { single_elimination: 'Élimination directe', round_robin: 'Championnat (round robin)' };
const PRESETS = [
  ['Yas Cards Championship', 'cards', 4], ['Yas Connect League', 'connect', 2], ['Yas Penalty Cup', 'penalty', 2],
  ['Yas Ludo Masters', 'ludo', 4], ['Yas Foot Cup', 'foot', 2], ['Défi Yas Weekly Challenge', 'connect', 2],
];

export function TournamentsAdmin() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', gameId: 'connect', format: 'single_elimination', playersPerMatch: 2, maxParticipants: 16, startsAt: '', endsAt: '', description: '', inviteOnly: false });
  const load = () => api.get('/admin/tournaments').then(r => setList(r.data.tournaments)).catch(e => setError(adminError(e)));
  useEffect(() => { load(); }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post('/admin/tournaments', { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() });
      setForm(f => ({ ...f, name: '', description: '' }));
      load();
    } catch (err) { setError(adminError(err)); }
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <div className="stack lg">
      <Head title="Tournois" sub="Les récompenses réelles éventuelles ne seront activées qu'après validation du règlement de campagne." />
      <ErrorBox error={error} />
      <div className="panel">
        <h2>Nouveau tournoi</h2>
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {PRESETS.map(([n, g, pp]) => <button key={n} type="button" className="tab" onClick={() => setForm(f => ({ ...f, name: n, gameId: g, playersPerMatch: pp }))}>{n}</button>)}
        </div>
        <form className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={create}>
          <input className="adm-input" placeholder="Nom" value={form.name} onChange={set('name')} required style={{ minWidth: 220 }} />
          <select className="adm-input" value={form.gameId} onChange={set('gameId')}>{Object.entries(GAME_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select className="adm-input" value={form.format} onChange={set('format')}>{Object.entries(FORMAT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <label className="small">Joueurs/match<input className="adm-input" type="number" min={2} max={4} value={form.playersPerMatch} onChange={set('playersPerMatch')} style={{ width: 70 }} /></label>
          <label className="small">Participants max<input className="adm-input" type="number" min={2} max={256} value={form.maxParticipants} onChange={set('maxParticipants')} style={{ width: 90 }} /></label>
          <label className="small">Début<input className="adm-input" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required /></label>
          <label className="small">Fin<input className="adm-input" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} required /></label>
          <input className="adm-input" placeholder="Description / règles" value={form.description} onChange={set('description')} style={{ minWidth: 260 }} />
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={form.inviteOnly} onChange={set('inviteOnly')} /> Sur invitation</label>
          <button className="btn sm">Créer (brouillon)</button>
        </form>
      </div>
      {!list ? <Loading /> : (
        <DataTable rows={list} empty="Aucun tournoi." columns={[
          { key: 'name', label: 'Tournoi', render: r => <Link to={`/admin/tournaments/${r.id}`} className="bold">{r.name}</Link> },
          { key: 'game_id', label: 'Jeu', render: r => GAME_NAMES[r.game_id] }, { key: 'format', label: 'Format', render: r => FORMAT[r.format] },
          { key: 'status', label: 'Statut', render: r => STATUS[r.status] }, { key: 'participants', label: 'Inscrits', num: true, render: r => `${r.participants}/${r.max_participants}` },
          { key: 'starts_at', label: 'Début', render: r => fmt.dt(r.starts_at) },
        ]} />
      )}
    </div>
  );
}

export function TournamentAdminDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [username, setUsername] = useState('');
  const load = () => api.get(`/admin/tournaments/${id}`).then(r => setT(r.data.tournament)).catch(e => setError(adminError(e)));
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(path, body, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try { await api.post(`/admin/tournaments/${id}/${path}`, body); setError(null); load(); } catch (e) { setError(adminError(e)); }
  }
  async function winner(m, winnerId) {
    const reason = window.prompt('Motif de la décision (journalisé) :');
    if (!reason) return;
    act(`matches/${m.id}/winner`, { winnerId, reason });
  }
  if (!t) return error ? <ErrorBox error={error} /> : <Loading />;
  const rounds = [...new Set(t.matches.map(m => m.round))];
  return (
    <div className="stack lg">
      <Link to="/admin/tournaments" className="link small" style={{ alignSelf: 'flex-start' }}>Tournois</Link>
      <Head title={t.name} sub={`${GAME_NAMES[t.game_id]} · ${FORMAT[t.format]} · ${STATUS[t.status]} · ${t.participants.length}/${t.max_participants} inscrits`}>
        {t.status === 'draft' && <button className="btn sm" onClick={() => act('open')}>Publier et ouvrir les inscriptions</button>}
        {['draft', 'registration'].includes(t.status) && <button className="btn sm blue" onClick={() => act('start', null, 'Générer les confrontations et lancer le tournoi ?')}>Lancer le tournoi</button>}
        {t.status === 'completed' && !t.rules?.resultsPublishedAt && <button className="btn sm" onClick={() => act('publish')}>Publier les gagnants</button>}
        {!['completed', 'cancelled'].includes(t.status) && <button className="btn sm danger" onClick={() => { const reason = window.prompt('Motif de l\'annulation :'); if (reason) act('cancel', { reason }); }}>Annuler</button>}
      </Head>
      <ErrorBox error={error} />
      {t.rules?.resultsPublishedAt && <div className="alert success">Résultats publiés le {fmt.dt(t.rules.resultsPublishedAt)}.</div>}
      <div className="adm-grid c2">
        <div className="panel">
          <h2>Participants</h2>
          {['draft', 'registration'].includes(t.status) && (
            <form className="row" style={{ gap: 8, marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); act('participants', { username }).then(() => setUsername('')); }}>
              <input className="adm-input" placeholder="Pseudonyme du joueur" value={username} onChange={e => setUsername(e.target.value)} />
              <button className="btn sm">Ajouter</button>
            </form>
          )}
          <DataTable rows={t.participants} empty="Aucun inscrit." columns={[
            { key: 'seed', label: 'Tête de série', num: true }, { key: 'username', label: 'Pseudonyme' }, { key: 'status', label: 'Statut' },
            ...(['draft', 'registration'].includes(t.status) ? [{ key: 'x', label: '', render: r => (
              <button className="btn sm outline" onClick={() => api.delete(`/admin/tournaments/${id}/participants/${r.id}`).then(load).catch(e => setError(adminError(e)))}>Retirer</button>) }] : []),
          ]} />
        </div>
        <div className="panel">
          <h2>Classement final</h2>
          <DataTable rows={t.results} empty="Disponible à la fin du tournoi." columns={[
            { key: 'rank', label: 'Rang', num: true }, { key: 'username', label: 'Joueur' },
            ...(t.format === 'round_robin' ? [{ key: 'points', label: 'Points', num: true }] : []), { key: 'wins', label: 'Victoires', num: true },
          ]} />
        </div>
      </div>
      {rounds.map(r => (
        <div key={r} className="panel">
          <h2>{t.format === 'round_robin' ? `Journée ${r}` : `Tour ${r}`}</h2>
          <DataTable rows={t.matches.filter(m => m.round === r)} columns={[
            { key: 'position', label: 'Match', num: true }, { key: 'room_code', label: 'Salon' },
            { key: 'status', label: 'Statut' },
            { key: 'players', label: 'Joueurs', render: m => (m.players || []).map(p => `${p.username}${m.winner_id === p.userId ? ' 🏆' : ''}`).join(' vs ') },
            { key: 'x', label: 'Décision manuelle', render: m => (['pending', 'ready'].includes(m.status) ? (
              <span className="row" style={{ gap: 4 }}>{(m.players || []).map(p => <button key={p.userId} className="btn sm outline" onClick={() => winner(m, p.userId)}>{p.username} gagne</button>)}</span>) : '—') },
          ]} />
        </div>
      ))}
    </div>
  );
}
