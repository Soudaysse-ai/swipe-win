import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useSession } from '../SessionContext';
import Avatar from '../../components/Avatar';
import { BackHeader, Spinner, Empty } from '../../components/ui';
import { gameName, formatDate } from '../../lib/format';

const STATUS = { registration: ['Inscriptions ouvertes', 'sunset'], in_progress: ['En cours', 'sky'], completed: ['Terminé', ''], draft: ['Brouillon', ''], cancelled: ['Annulé', 'red'] };
const FORMAT = { single_elimination: 'Élimination directe', round_robin: 'Championnat' };

export function TournamentsList() {
  const [list, setList] = useState(null);
  useEffect(() => { playerApi.get('/tournaments').then(r => setList(r.data.tournaments)).catch(() => setList([])); }, []);
  return (
    <div className="stack">
      <BackHeader title="Tournois" />
      {!list ? <Spinner center /> : !list.length ? <Empty icon="🏆">Aucun tournoi pour le moment. Reviens bientôt !</Empty> : (
        <div className="list">
          {list.map(t => (
            <Link key={t.id} to={`/tournaments/${t.id}`} className="list-item">
              <span style={{ fontSize: 28 }} aria-hidden>🏆</span>
              <div className="grow">
                <div className="title">{t.name}</div>
                <div className="sub">{gameName(t.game_id)} · {FORMAT[t.format]} · {t.participants}/{t.max_participants}</div>
                <div className="sub">{formatDate(t.starts_at)}</div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                <span className={`chip ${STATUS[t.status]?.[1]}`}>{STATUS[t.status]?.[0]}</span>
                {t.registered && <span className="chip blue">Inscrit</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TournamentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { joinRoom } = useSession();
  const [t, setT] = useState(null);
  const load = useCallback(() => playerApi.get(`/tournaments/${id}`).then(r => setT(r.data.tournament)).catch(() => setT({ error: true })), [id]);
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  if (!t) return <Spinner center />;
  if (t.error) return <Empty icon="🤷">Tournoi introuvable.</Empty>;
  const rounds = [...new Set(t.matches.map(m => m.round))];
  const myMatch = t.matches.find(m => m.room_code && m.status === 'ready');

  async function toggle() {
    try {
      if (t.registered) await playerApi.delete(`/tournaments/${id}/join`); else await playerApi.post(`/tournaments/${id}/join`);
      load();
    } catch (err) { toast(apiError(err)); }
  }

  return (
    <div className="stack">
      <BackHeader title={t.name} to="/tournaments" />
      <div className="card stack">
        <div className="row between"><span className="bold">{gameName(t.game_id)}</span><span className={`chip ${STATUS[t.status]?.[1]}`}>{STATUS[t.status]?.[0]}</span></div>
        {t.description && <p className="small">{t.description}</p>}
        <div className="small muted">{FORMAT[t.format]} · {t.players_per_match} joueurs par match · {t.participants.length}/{t.max_participants} inscrits</div>
        <div className="small muted">Du {formatDate(t.starts_at)} au {formatDate(t.ends_at)}</div>
        {t.status === 'registration' && !t.invite_only && (
          <button className={`btn block${t.registered ? ' outline' : ''}`} onClick={toggle}>{t.registered ? 'Me désinscrire' : <>M'inscrire <span className="arrow" /></>}</button>
        )}
        {t.invite_only && t.status === 'registration' && <div className="alert info">Tournoi sur invitation : les participants sont désignés par Yas.</div>}
        {myMatch && <button className="btn block" onClick={() => joinRoom(myMatch.room_code)}>Rejoindre mon match (tour {myMatch.round}) <span className="arrow" /></button>}
      </div>

      {t.results.length > 0 && (
        <>
          <div className="section-title"><h2>Classement final</h2></div>
          <div className="list">
            {t.results.map(r => (
              <div key={r.id} className={`list-item${r.id === user?.id ? ' me' : ''}`}>
                <span className="rank-num">{r.rank}</span><Avatar id={r.avatar} size={36} />
                <div className="grow title">{r.username}</div>
                {t.format === 'round_robin' && <b>{r.points} pts</b>}
              </div>
            ))}
          </div>
        </>
      )}

      {rounds.map(r => (
        <div key={r} className="stack" style={{ gap: 8 }}>
          <div className="section-title" style={{ margin: '12px 0 0' }}><h2>{t.format === 'round_robin' ? `Journée ${r}` : `Tour ${r}`}</h2></div>
          {t.matches.filter(m => m.round === r).map(m => (
            <div key={m.id} className="card tight">
              <div className="row between tiny muted" style={{ marginBottom: 6 }}>
                <span>Match {m.position}</span>
                <span>{m.status === 'completed' ? 'Terminé' : m.status === 'bye' ? 'Exempt' : m.status === 'ready' ? 'Salon ouvert' : 'En attente'}</span>
              </div>
              {(m.players || []).map(p => (
                <div key={p.userId} className="row" style={{ gap: 8, padding: '3px 0' }}>
                  <Avatar id={p.avatar} size={26} />
                  <span className={`grow small${m.winner_id === p.userId ? ' bold' : ''}`}>{p.username}</span>
                  {m.winner_id === p.userId && <span aria-label="vainqueur">🏆</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="section-title"><h2>Participants</h2></div>
      {t.participants.length ? (
        <div className="card row wrap" style={{ gap: 10 }}>
          {t.participants.map(p => <Link key={p.id} to={`/players/${p.id}`} className="row" style={{ gap: 6, textDecoration: 'none' }}><Avatar id={p.avatar} size={28} /><span className="small">{p.username}</span></Link>)}
        </div>
      ) : <Empty>Aucun inscrit pour le moment.</Empty>}
    </div>
  );
}
