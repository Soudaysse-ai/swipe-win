import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Head, DataTable, fmt, Loading, ErrorBox } from '../ui';

const REASONS = { insult: 'Insulte', spam: 'Spam', cheating: 'Triche', inappropriate_name: 'Pseudo inapproprié', other: 'Autre' };

export default function Moderation() {
  const { can } = useAdminAuth();
  const [tab, setTab] = useState('open');
  const [reports, setReports] = useState(null);
  const [chat, setChat] = useState(null);
  const [q, setQ] = useState('');
  const [onlyFiltered, setOnlyFiltered] = useState(false);
  const [error, setError] = useState(null);
  const loadReports = () => api.get('/admin/reports', { params: { status: tab } }).then(r => setReports(r.data.reports)).catch(e => setError(adminError(e)));
  const loadChat = () => api.get('/admin/chat', { params: { q: q || undefined, filtered: onlyFiltered || undefined } }).then(r => setChat(r.data.messages)).catch(e => setError(adminError(e)));
  useEffect(() => { if (tab !== 'chat') loadReports(); else loadChat(); }, [tab, q, onlyFiltered]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolve(r, status, action) {
    const resolution = window.prompt(`${status === 'dismissed' ? 'Classer sans suite' : `Action : ${action}`} — motif (journalisé) :`);
    if (!resolution) return;
    try { await api.post(`/admin/reports/${r.id}/resolve`, { status, action, resolution }); loadReports(); } catch (e) { setError(adminError(e)); }
  }
  async function hide(m) {
    const reason = window.prompt('Motif du masquage :');
    if (!reason) return;
    try { await api.post(`/admin/chat/${m.id}/hide`, { reason }); loadChat(); } catch (e) { setError(adminError(e)); }
  }

  return (
    <div className="stack lg">
      <Head title="Modération" sub="Signalements des joueurs et messages du chat. Le filtrage automatique masque déjà les insultes courantes." />
      <div className="tabs">
        {[['open', 'Signalements ouverts'], ['resolved', 'Traités'], ['dismissed', 'Classés'], ...(can('chat.moderate') ? [['chat', 'Messages du chat']] : [])].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {tab !== 'chat' ? (!reports ? <Loading /> : (
        <DataTable rows={reports} empty="Aucun signalement." columns={[
          { key: 'created_at', label: 'Date', render: r => fmt.dt(r.created_at) },
          { key: 'reported', label: 'Joueur signalé', render: r => <Link to={`/admin/users/${r.reported_user_id}`} className="bold">{r.reported}</Link> },
          { key: 'reason', label: 'Motif', render: r => REASONS[r.reason] }, { key: 'reporter', label: 'Par' },
          { key: 'message', label: 'Message / détails', render: r => <span className="small">{r.message ? `« ${r.message} »` : ''} {r.details || ''}</span> },
          { key: 'total_reports_on_user', label: 'Total', num: true },
          ...(tab === 'open' ? [{ key: 'x', label: 'Décision', render: r => (
            <span className="row wrap" style={{ gap: 4 }}>
              {r.message && <button className="btn sm outline" onClick={() => resolve(r, 'resolved', 'hide_message')}>Masquer le message</button>}
              {can('players.moderate') && <button className="btn sm outline" onClick={() => resolve(r, 'resolved', 'warn')}>Avertir</button>}
              {can('players.moderate') && <button className="btn sm outline" onClick={() => resolve(r, 'resolved', 'suspend')}>Suspendre</button>}
              {can('players.ban') && <button className="btn sm danger" onClick={() => resolve(r, 'resolved', 'ban')}>Bannir</button>}
              <button className="btn sm ghost" onClick={() => resolve(r, 'dismissed', 'none')}>Classer</button>
            </span>) }] : [{ key: 'resolution', label: 'Décision' }, { key: 'handled_by_email', label: 'Par' }]),
        ]} />
      )) : (
        <>
          <div className="filters">
            <input placeholder="Rechercher dans les messages" value={q} onChange={e => setQ(e.target.value)} />
            <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={onlyFiltered} onChange={e => setOnlyFiltered(e.target.checked)} /> Seulement les messages filtrés</label>
          </div>
          {!chat ? <Loading /> : (
            <DataTable rows={chat} empty="Aucun message." columns={[
              { key: 'created_at', label: 'Date', render: r => fmt.dt(r.created_at) },
              { key: 'username', label: 'Joueur', render: r => <Link to={`/admin/users/${r.user_id}`}>{r.username}</Link> },
              { key: 'body', label: 'Message', render: r => <span style={{ textDecoration: r.hidden_at ? 'line-through' : 'none' }}>{r.body}</span> },
              { key: 'filtered', label: 'Filtré', render: r => (r.filtered ? 'oui' : '') },
              { key: 'x', label: '', render: r => (r.hidden_at ? 'masqué' : <button className="btn sm outline" onClick={() => hide(r)}>Masquer</button>) },
            ]} />
          )}
        </>
      )}
    </div>
  );
}
