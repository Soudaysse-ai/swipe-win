// Récupération de compte : joueurs qui ont oublié leur mot de passe et n'ont pas
// (ou plus) accès à un e-mail. L'agent vérifie l'identité en rappelant le numéro
// Yas, puis envoie le lien : l'adresse indiquée est alors enregistrée sur le compte.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import Avatar from '../../components/Avatar';
import { Head, DataTable, fmt, Loading, ErrorBox } from '../ui';

const telLink = (phone) => `tel:${String(phone).replace(/\s/g, '')}`;
const prettyPhone = (p) => String(p).replace(/^\+269(\d{3})(\d{2})(\d{2})$/, '+269 $1 $2 $3');

export default function Recovery() {
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => api.get('/admin/recovery', { params: { status: tab } }).then(r => setData(r.data)).catch(e => setError(adminError(e)));
  useEffect(() => { setData(null); load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(r) {
    if (!window.confirm(`Identité de ${r.username} vérifiée par téléphone ?\n\nL'adresse ${r.email} sera enregistrée sur le compte et le lien de réinitialisation y sera envoyé.`)) return;
    setBusy(r.id); setError(null);
    try {
      const { data: out } = await api.post(`/admin/recovery/${r.id}/approve`);
      setResult({ ...out, username: r.username });
      load();
    } catch (e) { setError(adminError(e)); } finally { setBusy(null); }
  }
  async function reject(r) {
    const reason = window.prompt(`Refuser la demande de ${r.username} — motif (journalisé) :`);
    if (!reason) return;
    setBusy(r.id); setError(null);
    try { await api.post(`/admin/recovery/${r.id}/reject`, { reason }); load(); } catch (e) { setError(adminError(e)); } finally { setBusy(null); }
  }

  return (
    <div className="stack lg">
      <Head title="Récupération de compte"
        sub="Joueurs qui ont oublié leur mot de passe sans pouvoir recevoir de lien par e-mail. Appelez le numéro pour vérifier qu'il s'agit bien du titulaire du compte, puis envoyez le lien." />
      <div className="tabs">
        {[['pending', `À traiter${data && tab === 'pending' ? ` (${data.pending})` : ''}`], ['sent', 'Liens envoyés'], ['rejected', 'Refusées']].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => { setResult(null); setTab(k); }}>{l}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {result && (
        <div className="card stack" role="status">
          {result.emailed
            ? <p>Lien envoyé à <b>{result.email}</b> pour <b>{result.username}</b> (valable {result.expiresInMinutes} minutes).</p>
            : (
              <>
                <p>L'e-mail n'a pas pu partir. Transmettez ce lien à <b>{result.username}</b> (valable {result.expiresInMinutes} minutes, usage unique) :</p>
                <code className="small" style={{ wordBreak: 'break-all' }}>{result.link}</code>
              </>
            )}
        </div>
      )}
      {!data ? <Loading /> : (
        <DataTable rows={data.requests} empty={tab === 'pending' ? 'Aucune demande en attente.' : 'Aucune demande.'} columns={[
          { key: 'created_at', label: 'Demande', render: r => fmt.dt(r.updated_at || r.created_at) },
          { key: 'username', label: 'Joueur', render: r => (
            <Link to={`/admin/users/${r.user_id}`} className="row" style={{ gap: 8 }}><Avatar id={r.avatar} size={28} /><b>{r.username}</b></Link>
          ) },
          { key: 'phone', label: 'Numéro à rappeler', render: r => <a href={telLink(r.phone)} className="bold">{prettyPhone(r.phone)}</a> },
          { key: 'email', label: 'E-mail demandé', render: r => (
            <span>{r.email}{r.current_email && r.current_email !== r.email && <span className="tiny muted"><br />actuel : {r.current_email}</span>}</span>
          ) },
          { key: 'note', label: 'Détail donné', render: r => <span className="small">{r.note || '—'}</span> },
          { key: 'user_created_at', label: 'Inscrit le', render: r => fmt.date(r.user_created_at) },
          ...(tab === 'pending' ? [{ key: 'x', label: 'Décision', render: r => (
            <span className="row wrap" style={{ gap: 4 }}>
              <button className="btn sm" disabled={busy === r.id} onClick={() => approve(r)}>Identité vérifiée : envoyer le lien</button>
              <button className="btn sm ghost" disabled={busy === r.id} onClick={() => reject(r)}>Refuser</button>
            </span>) }]
            : [{ key: 'handled_at', label: 'Traitée le', render: r => fmt.dt(r.handled_at) }, { key: 'handled_by_email', label: 'Par' },
              ...(tab === 'rejected' ? [{ key: 'admin_note', label: 'Motif' }] : [])]),
        ]} />
      )}
    </div>
  );
}
