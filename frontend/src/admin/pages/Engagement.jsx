import { useEffect, useState } from 'react';
import api, { adminError } from '../../utils/api';
import { Head, Kpi, DateRange, useRange, fmt, TimeSeries, DataTable, Loading, ErrorBox } from '../ui';

export default function Engagement() {
  const [range, setRange] = useRange(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setD(null);
    api.get('/admin/engagement', { params: range }).then(r => setD(r.data)).catch(e => setError(adminError(e)));
  }, [range]);
  return (
    <div>
      <Head title="Engagement" sub="DAU / WAU / MAU calculés à la date de fin. Joueur actif = a joué, rejoint un salon ou interagi (une simple connexion ne compte pas).">
        <DateRange value={range} onChange={setRange} />
      </Head>
      <ErrorBox error={error} />
      {!d ? <Loading /> : (
        <div className="stack lg">
          <div className="adm-grid k4">
            <Kpi label="DAU" value={fmt.n(d.dau)} />
            <Kpi label="WAU" value={fmt.n(d.wau)} />
            <Kpi label="MAU" value={fmt.n(d.mau)} hint={d.stickiness != null ? `DAU/MAU : ${fmt.pct(d.stickiness)}` : null} />
            <Kpi label="Rétention J1" value={fmt.pct(d.retention.d1)} />
            <Kpi label="Rétention J7" value={fmt.pct(d.retention.d7)} />
            <Kpi label="Rétention J30" value={fmt.pct(d.retention.d30)} />
            <Kpi label="Parties moyennes par joueur" value={d.avgMatchesPerPlayer != null ? Number(d.avgMatchesPerPlayer).toFixed(1) : '—'} />
            <Kpi label="Sessions par joueur" value={d.sessionsPerPlayer != null ? Number(d.sessionsPerPlayer).toFixed(1) : '—'} />
            <Kpi label="Durée moyenne de session" value={fmt.dur(d.avgSessionMs)} />
            <Kpi label="Invitations envoyées" value={fmt.n(d.invitationsSent)} />
            <Kpi label="Invitations acceptées" value={fmt.n(d.invitationsAccepted)} hint={d.invitationsSent ? `${fmt.pct(d.invitationsAccepted / d.invitationsSent)} d'acceptation` : null} />
            <Kpi label="Joueurs réactivés" value={fmt.n(d.reactivatedPlayers)} hint="actifs après ≥ 14 jours d'absence" />
          </div>
          <TimeSeries title="Utilisateurs actifs quotidiens (DAU)" data={d.dauSeries} dataKey="dau" name="DAU" />
          <div className="panel">
            <h2>Cohortes d'inscription</h2>
            <p className="small muted" style={{ marginBottom: 10 }}>Part des inscrits d'un jour actifs J+1, J+7 et J+30 (mis à jour toutes les heures).</p>
            <DataTable rows={d.cohorts} empty="Pas encore de cohorte sur cette période." columns={[
              { key: 'cohortDate', label: 'Cohorte', render: r => fmt.date(r.cohortDate) }, { key: 'size', label: 'Inscrits', num: true },
              { key: 'd1', label: 'J1', num: true, render: r => fmt.pct(r.d1) }, { key: 'd7', label: 'J7', num: true, render: r => fmt.pct(r.d7) },
              { key: 'd30', label: 'J30', num: true, render: r => fmt.pct(r.d30) },
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}
