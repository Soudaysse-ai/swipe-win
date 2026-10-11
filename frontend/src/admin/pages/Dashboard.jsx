import { useEffect, useState } from 'react';
import api, { adminError } from '../../utils/api';
import { Head, Kpi, DateRange, useRange, fmt, TimeSeries, CategoryBars, GAME_COLORS, GAME_NAMES, Loading, ErrorBox } from '../ui';

export default function Dashboard() {
  const [range, setRange] = useRange(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get('/admin/dashboard', { params: range }).then(r => setData(r.data)).catch(e => setError(adminError(e)));
  }, [range]);
  const k = data?.kpis;
  return (
    <div>
      <Head title="Dashboard général" sub="Données réelles de la plateforme. Les variations comparent à la période précédente de même durée.">
        <DateRange value={range} onChange={setRange} />
      </Head>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="stack lg">
          <div className="adm-grid k4">
            <Kpi label="Utilisateurs (total)" value={fmt.n(k.totalUsers)} />
            <Kpi label="Nouveaux inscrits" value={fmt.n(k.newUsers)} change={k.newUsersChange} />
            <Kpi label="Joueurs actifs aujourd'hui" value={fmt.n(k.activeToday)} />
            <Kpi label="Actifs sur 7 jours" value={fmt.n(k.active7d)} />
            <Kpi label="Actifs sur 30 jours" value={fmt.n(k.active30d)} />
            <Kpi label="Actifs sur la période" value={fmt.n(k.activeUsers)} change={k.activeUsersChange} />
            <Kpi label="Connectés maintenant" value={fmt.n(k.onlineNow)} />
            <Kpi label="Parties en cours" value={fmt.n(k.matchesInProgress)} />
            <Kpi label="Parties terminées" value={fmt.n(k.matchesCompleted)} change={k.matchesChange} />
            <Kpi label="Temps de jeu total" value={fmt.dur(k.totalPlayTimeMs)} change={k.playTimeChange} />
            <Kpi label="Temps moyen de session" value={fmt.dur(k.avgSessionMs)} />
            <Kpi label="Jeu le plus populaire" value={k.mostPopularGame ? k.mostPopularGame.name : '—'} hint={k.mostPopularGame ? `${fmt.n(k.mostPopularGame.n)} parties` : null} />
            <Kpi label="Matchs (depuis le lancement)" value={fmt.n(k.totalMatches)} />
          </div>
          <div className="adm-grid c2">
            <TimeSeries title="Utilisateurs actifs par jour" data={data.series} dataKey="active" name="actifs" />
            <TimeSeries title="Parties terminées par jour" data={data.series} dataKey="matches" name="parties" />
            <TimeSeries title="Inscriptions par jour" data={data.series} dataKey="registrations" name="inscriptions" />
            <CategoryBars title="Répartition des parties par jeu" labelKey="name" valueKey="matches"
              data={data.gameDistribution.map(g => ({ ...g, name: GAME_NAMES[g.game_id] || g.name }))} colorOf={(d) => GAME_COLORS[d.game_id]} />
          </div>
        </div>
      )}
    </div>
  );
}
