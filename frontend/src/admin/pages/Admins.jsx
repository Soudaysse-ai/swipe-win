import { useEffect, useState } from 'react';
import api, { adminError } from '../../utils/api';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { ROLE_LABEL } from '../AdminLayout';
import { Head, DataTable, fmt, Loading, ErrorBox, ExportButtons } from '../ui';

export function Admins() {
  const { admin: me } = useAdminAuth();
  const [admins, setAdmins] = useState(null);
  const [roles, setRoles] = useState({ roles: [], permissions: [] });
  const [form, setForm] = useState({ email: '', name: '', role: 'data_analyst', password: '' });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => {
    api.get('/admin/admins').then(r => setAdmins(r.data.admins)).catch(e => setError(adminError(e)));
    api.get('/admin/roles').then(r => setRoles(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function create(e) {
    e.preventDefault();
    try { await api.post('/admin/admins', form); setMsg(`Compte créé pour ${form.email}.`); setForm({ email: '', name: '', role: 'data_analyst', password: '' }); load(); } catch (err) { setError(adminError(err)); }
  }
  async function update(a, patch) {
    try { await api.put(`/admin/admins/${a.id}`, patch); setMsg('Modification enregistrée.'); load(); } catch (err) { setError(adminError(err)); }
  }
  return (
    <div className="stack lg">
      <Head title="Administrateurs" sub="Seul le Super Admin gère les comptes. Les permissions sont contrôlées côté serveur." />
      <ErrorBox error={error} />
      {msg && <div className="alert success">{msg}</div>}
      <div className="panel">
        <h2>Nouvel administrateur</h2>
        <form className="row wrap" style={{ gap: 8 }} onSubmit={create}>
          <input className="adm-input" type="email" placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <input className="adm-input" placeholder="Nom" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <select className="adm-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>{roles.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <input className="adm-input" type="password" placeholder="Mot de passe provisoire (10+)" minLength={10} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          <button className="btn sm">Créer</button>
        </form>
      </div>
      {!admins ? <Loading /> : (
        <DataTable rows={admins} columns={[
          { key: 'email', label: 'E-mail', render: a => <b>{a.email}{a.id === me?.id ? ' (moi)' : ''}</b> }, { key: 'name', label: 'Nom' },
          { key: 'role', label: 'Rôle', render: a => (
            <select className="adm-input" value={a.role} disabled={a.id === me?.id} onChange={e => update(a, { role: e.target.value })}>
              {roles.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>) },
          { key: 'is_active', label: 'Actif', render: a => (
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={a.is_active} disabled={a.id === me?.id} onChange={e => update(a, { isActive: e.target.checked })} />{a.is_active ? 'oui' : 'non'}</label>) },
          { key: 'last_login_at', label: 'Dernière connexion', render: a => fmt.dt(a.last_login_at) },
          { key: 'x', label: '', render: a => <button className="btn sm outline" onClick={() => { const p = window.prompt('Nouveau mot de passe (10 caractères minimum) :'); if (p) update(a, { password: p }); }}>Mot de passe</button> },
        ]} />
      )}
      <div className="panel">
        <h2>Rôles et permissions</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Permission</th>{roles.roles.map(r => <th key={r.id} className="center">{ROLE_LABEL[r.id] || r.label}</th>)}</tr></thead>
            <tbody>{roles.permissions.map(p => (
              <tr key={p.id}><td title={p.id}>{p.description}</td>{roles.roles.map(r => <td key={r.id} className="center">{r.permissions.includes(p.id) ? '✓' : ''}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Audit() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get('/admin/audit', { params: { page, entity: entity || undefined } }).then(r => setData(r.data)).catch(e => setError(adminError(e)));
  }, [page, entity]);
  return (
    <div className="stack lg">
      <Head title="Journal d'audit" sub="Toutes les actions administratives sensibles, avec leur auteur, leur motif et l'état avant / après.">
        <ExportButtons path="/admin/audit" params={{ entity: entity || undefined }} />
      </Head>
      <div className="filters">
        <select className="adm-input" value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}>
          <option value="">Tous les objets</option>
          {['user', 'match', 'tournament', 'tournament_match', 'admin', 'leaderboards', 'season', 'game', 'report', 'chat_message', 'players', 'prize', 'setting'].map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          <DataTable rows={data.logs} empty="Aucune entrée." columns={[
            { key: 'created_at', label: 'Date', render: l => fmt.dt(l.created_at) }, { key: 'admin_email', label: 'Administrateur' },
            { key: 'action', label: 'Action' }, { key: 'entity', label: 'Objet' }, { key: 'entity_id', label: 'Identifiant', render: l => <span className="tiny">{l.entity_id}</span> },
            { key: 'reason', label: 'Motif' },
            { key: 'diff', label: 'Après', render: l => <code className="tiny">{l.new_data ? JSON.stringify(l.new_data).slice(0, 90) : ''}</code> },
          ]} />
          <div className="pager"><span>{fmt.n(data.total)} entrée(s)</span>
            <div className="row" style={{ gap: 6 }}><button className="btn sm outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button><button className="btn sm outline" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Suivant</button></div>
          </div>
        </>
      )}
    </div>
  );
}

const CONFIG_LABELS = {
  turnSeconds: 'Secondes par tour', decisionSeconds: 'Secondes par décision', reconnectSeconds: 'Délai de reconnexion (s)',
  networkToleranceSeconds: 'Tolérance réseau (s)', maxTimeouts: 'Expirations avant forfait', minActionsForValid: 'Actions min. pour valider',
  maxShotsPerPlayer: 'Tirs max par joueur', setupSeconds: 'Avant-match (s)',
};

// « Swipe & gagne » : visible ou masqué pour les joueurs (menus, accueil, pages du quiz).
function QuizVisibility() {
  const { can } = useAdminAuth();
  const [visible, setVisible] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (can('quiz.manage')) api.get('/admin/quiz/settings/visible').then(r => setVisible(r.data.visible)).catch(e => setError(adminError(e)));
  }, [can]);
  if (!can('quiz.manage')) return null;
  async function toggle(next) {
    setError(null);
    try { setVisible((await api.put('/admin/quiz/settings/visible', { visible: next })).data.visible); } catch (e) { setError(adminError(e)); }
  }
  return (
    <div className="panel stack">
      <div className="row between wrap" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Swipe & gagne <span className="tiny muted">quiz football</span></h2>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={!!visible} disabled={visible === null} onChange={e => toggle(e.target.checked)} /> Visible pour les joueurs
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {visible === null ? 'Chargement…' : visible
          ? 'Affiché dans les menus, sur l\'accueil et dans la page Jeux. Les joueurs peuvent lancer une partie.'
          : 'Masqué : aucune entrée côté joueurs et aucune nouvelle partie possible. Les questions, lots et historiques restent gérables ici.'}
      </p>
      <ErrorBox error={error} />
    </div>
  );
}

export function Settings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api.get('/admin/games').then(r => setData(r.data)).catch(e => setError(adminError(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save(g, patch) {
    try { await api.put(`/admin/games/${g.id}`, patch); setMsg(`${g.name} mis à jour.`); load(); } catch (e) { setError(adminError(e)); }
  }
  async function saveLeagues(g, leagues) {
    try { await api.put(`/admin/games/${g.id}/leagues`, { leagues }); setMsg(`Ligues de ${g.name} mises à jour.`); load(); } catch (e) { setError(adminError(e)); }
  }
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <div className="stack lg">
      <Head title="Réglages des jeux" sub="Chronomètres, tolérance réseau, seuils de ligue. Chaque modification est journalisée et s'applique aux nouvelles parties." />
      <ErrorBox error={error} />
      {msg && <div className="alert success">{msg}</div>}
      <QuizVisibility />
      {data.games.map(g => {
        const lg = data.leagues.filter(l => l.game_id === g.id);
        return (
          <div key={g.id} className="panel stack">
            <div className="row between"><h2 style={{ margin: 0 }}>{g.name} <span className="tiny muted">règles v{g.rules_version}</span></h2>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={g.is_active} onChange={e => save(g, { isActive: e.target.checked })} /> Jeu ouvert aux joueurs</label></div>
            <form className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save(g, { config: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, Number(v)])) });
            }}>
              {Object.entries(g.config).filter(([k]) => CONFIG_LABELS[k]).map(([k, v]) => (
                <label key={k} className="small">{CONFIG_LABELS[k]}<input className="adm-input" name={k} type="number" defaultValue={v} style={{ width: 110, display: 'block' }} /></label>
              ))}
              <button className="btn sm blue">Enregistrer</button>
            </form>
            <form className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              saveLeagues(g, lg.map(l => ({ name: l.name, minRating: Number(fd.get(l.name)) })));
            }}>
              {lg.map(l => <label key={l.name} className="small">{l.name} ≥<input className="adm-input" name={l.name} type="number" defaultValue={l.min_rating} style={{ width: 90, display: 'block' }} /></label>)}
              <button className="btn sm outline">Enregistrer les ligues</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
