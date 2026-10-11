import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { adminError } from '../../utils/api';
import { Head, Kpi, DateRange, useRange, fmt, TimeSeries, CategoryBars, ExportButtons, DataTable, GAME_COLORS, GAME_NAMES, Loading, ErrorBox } from '../ui';

const LEAGUE_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'];

function Highlight({ label, who, value }) {
  return <Kpi label={label} value={who ? who.username : '—'} hint={who ? value : 'Pas encore de données'} />;
}

export default function GameDashboard() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useRange(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/admin/games/${gameId}/analytics`, { params: range }).then(r => setData(r.data)).catch(e => setError(adminError(e)));
  }, [gameId, range]);
  const color = GAME_COLORS[gameId];
  const t = data?.totals;
  const sp = data?.specific || {};
  return (
    <div>
      <Head title={`Dashboard ${GAME_NAMES[gameId]}`} sub="Parties validées uniquement (les parties annulées ou trop courtes sont exclues).">
        <DateRange value={range} onChange={setRange} />
      </Head>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="stack lg">
          <div className="adm-grid k4">
            <Kpi label="Joueurs (total)" value={fmt.n(t.totalPlayers)} />
            <Kpi label="Joueurs actifs (période)" value={fmt.n(t.activePlayers)} />
            <Kpi label="Parties jouées" value={fmt.n(t.matches)} hint={t.invalidMatches ? `${t.invalidMatches} non validée(s)` : null} />
            <Kpi label="Parties en cours" value={fmt.n(t.inProgress)} />
            <Kpi label="Durée moyenne" value={fmt.dur(t.avgDurationMs)} />
            {gameId === 'connect' && <>
              <Kpi label="Victoires / défaites" value={`${fmt.n(sp.wins)} / ${fmt.n(sp.losses)}`} />
              <Kpi label="Matchs nuls" value={fmt.n(sp.draws)} />
              <Kpi label="Coups moyens par partie" value={sp.avg_moves ?? '—'} />
            </>}
            {(gameId === 'ludo' || gameId === 'cards') && (sp.bySize || []).map(s => (
              <Kpi key={s.players} label={`Parties à ${s.players} joueurs`} value={fmt.n(s.matches)} />
            ))}
            <Highlight label="Joueur n°1 (cote)" who={data.number1} value={data.number1 && `cote ${Math.round(data.number1.rating)}`} />
            <Highlight label="Joueur le plus actif" who={data.mostActive} value={data.mostActive && `${data.mostActive.matches} parties`} />
            <Highlight label="Plus de victoires" who={data.mostWins} value={data.mostWins && `${data.mostWins.wins} victoires`} />
            <Highlight label="Meilleur taux (≥ 20 parties)" who={data.bestWinRate} value={data.bestWinRate && fmt.pct(data.bestWinRate.win_rate)} />
          </div>
          <div className="adm-grid c2">
            <TimeSeries title="Parties par jour" data={data.daily} dataKey="matches" name="parties" color={color} />
            <CategoryBars title="Distribution des ligues (joueurs)" labelKey="league" valueKey="players"
              data={[...data.leagueDistribution].sort((a, b) => LEAGUE_ORDER.indexOf(a.league) - LEAGUE_ORDER.indexOf(b.league))} />
            {(gameId === 'ludo' || gameId === 'cards') && (
              <CategoryBars title="Répartition des positions finales" labelKey="label" valueKey="n"
                data={(sp.placements || []).map(p => ({ ...p, label: `${p.place}e place` }))} />
            )}
          </div>
          <div className="panel">
            <div className="row between" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Top 100</h2><ExportButtons path={`/admin/games/${gameId}/analytics`} params={range} /></div>
            <DataTable rows={data.top100} onRowClick={(r) => navigate(`/admin/users/${r.user_id}`)} columns={[
              { key: 'rank', label: '#', num: true }, { key: 'username', label: 'Pseudonyme', render: r => <b>{r.username}</b> },
              { key: 'rating', label: 'Cote', num: true }, { key: 'league', label: 'Ligue' },
              { key: 'games_played', label: 'Parties', num: true }, { key: 'wins', label: 'Victoires', num: true },
              { key: 'win_rate', label: 'Taux', num: true, render: r => fmt.pct(r.win_rate) },
              ...(gameId === 'foot' ? [{ key: 'goals', label: 'Buts', num: true, render: r => fmt.n(r.extra?.goals || 0) }] : []),
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}
