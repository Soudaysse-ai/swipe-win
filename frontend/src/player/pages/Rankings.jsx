import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import Avatar from '../../components/Avatar';
import { Spinner, Empty, LeagueBadge, Sheet } from '../../components/ui';
import Icon from '../../components/Icon';
import { Podium } from './Home';
import { GAME_META, PERIOD_LABELS, percent } from '../../lib/format';

function RankChange({ v }) {
  if (v == null || v === 0) return <span className="tiny muted" aria-label="rang stable">–</span>;
  return <span className="tiny bold" style={{ color: v > 0 ? '#1E7A42' : '#B42A28' }} aria-label={`${v > 0 ? 'gagne' : 'perd'} ${Math.abs(v)} place(s)`}>{v > 0 ? '▲' : '▼'}{Math.abs(v)}</span>;
}

export default function Rankings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const game = params.get('game') || 'all';
  const period = params.get('period') || 'season';
  const board = params.get('board') || 'rating';
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState(null);
  const [help, setHelp] = useState(false);

  const set = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); if (k === 'game') p.delete('board'); setParams(p, { replace: true }); };

  useEffect(() => {
    setData(null);
    const url = game === 'all' ? '/leaderboards/global' : `/leaderboards/${game}`;
    playerApi.get(url, { params: { period, board, limit: 100 } }).then(r => setData(r.data)).catch(() => setData({ entries: [], total: 0 }));
  }, [game, period, board]);

  const unit = game === 'all' ? 'pts' : '';
  const entries = data?.entries || [];
  const rest = entries.slice(3, limit);

  return (
    <div className="stack">
      <div className="row between">
        <h1 className="h1">Classe<span className="accent">ments</span></h1>
        <button className="icon-btn" onClick={() => setHelp(true)} aria-label="Comment sont calculés les classements ?"><Icon name="alert" /></button>
      </div>
      <div className="tabs" role="tablist" aria-label="Jeu">
        {[['all', 'Tous les jeux'], ...Object.entries(GAME_META).map(([id, g]) => [id, g.name])].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={game === id} className={`tab${game === id ? ' active' : ''}`} onClick={() => set('game', id)}>{label}</button>
        ))}
      </div>
      <div className="tabs" role="tablist" aria-label="Période">
        {Object.entries(PERIOD_LABELS).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={period === id} className={`tab${period === id ? ' active' : ''}`} onClick={() => set('period', id)}>{label}</button>
        ))}
      </div>
      <p className="tiny muted">{game === 'all' ? 'Classement global : somme des points de saison de tous les jeux.' : 'Classement par cote compétitive du jeu.'}</p>

      {!data ? <Spinner center /> : !entries.length ? <Empty icon="🏆">Aucun joueur classé sur cette période.</Empty> : (
        <>
          <div className="card"><Podium entries={entries.slice(0, 3)} unit={unit} /></div>
          {rest.length > 0 && (
            <div className="list">
              {rest.map(e => (
                <Link key={e.userId} to={`/players/${e.userId}`} className={`list-item${e.userId === user?.id ? ' me' : ''}`}>
                  <span className="rank-num">{e.rank}</span>
                  <Avatar id={e.avatar} size={40} />
                  <div className="grow">
                    <div className="title">{e.username}</div>
                    <div className="sub row" style={{ gap: 6 }}><LeagueBadge league={e.league} /> {e.wins} V{e.winRate != null ? ` · ${percent(e.winRate)}` : ''}</div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <b>{e.value}{unit && unit !== '' ? <span className="tiny"> {unit}</span> : ''}</b>
                    <RankChange v={e.rankChange} />
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="tabs" style={{ justifyContent: 'center' }}>
            {[10, 50, 100].map(n => <button key={n} className={`tab${limit === n ? ' active' : ''}`} onClick={() => setLimit(n)}>Top {n}</button>)}
          </div>
        </>
      )}

      {data && (
        <div className="card yellow row" style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + 12px)' }}>
          {data.me ? (
            <>
              <span className="rank-num">{data.me.rank}</span>
              <Avatar id={data.me.avatar} size={40} />
              <div className="grow"><div className="bold">Ma position</div><div className="tiny">sur {data.total} joueurs classés</div></div>
              <b>{data.me.value} {unit}</b>
            </>
          ) : <span className="small bold">Tu n'es pas encore classé ici. Joue une partie pour entrer au classement !</span>}
        </div>
      )}

      <Sheet open={help} onClose={() => setHelp(false)} label="Comprendre les classements">
        <div className="stack small" style={{ lineHeight: 1.45 }}>
          <h2 className="h3">Trois indicateurs différents</h2>
          <p><b>⭐ XP & niveau</b> — ton expérience : chaque partie terminée rapporte des XP (10, +20 en cas de victoire, +10 pour un nul, +5 pour la première partie du jour, +15 pour le défi du jour). Les XP ne baissent jamais.</p>
          <p><b>📈 Cote</b> — ton vrai niveau dans chaque jeu (départ à 1000). Elle monte quand tu bats des joueurs forts et baisse quand tu perds. Elle détermine ta ligue (Bronze → Legend) et le classement du jeu.</p>
          <p><b>🏆 Points de saison</b> — le classement global « Tous les jeux » : victoire 30 pts, 2e place 15, 3e 8, 4e 3, nul en 1 contre 1 : 10. Au maximum 10 matchs comptés par jeu et par jour.</p>
          <p className="muted">À égalité : plus de victoires, puis meilleur taux de victoire, puis le premier à avoir atteint le score.</p>
        </div>
      </Sheet>
    </div>
  );
}
