// Recherche d'adversaires (bandeau) + confirmation de partie trouvée (modale).
import { useEffect, useState } from 'react';
import { useSession } from '../player/SessionContext';
import { useAuth } from '../player/AuthContext';
import { gameName } from '../lib/format';
import Avatar from './Avatar';
import { Sheet, Countdown } from './ui';

function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</>;
}

export default function MatchmakingOverlay() {
  const { mm, proposal, cancelSearch, answerProposal } = useSession();
  const { user } = useAuth();
  const accepted = proposal?.accepted?.includes(user?.id);

  return (
    <>
      {mm.state === 'searching' && !proposal && (
        <div style={{
          position: 'fixed', zIndex: 45, left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(var(--nav-h) + 10px + var(--safe-bottom))', width: 'calc(100% - 24px)', maxWidth: 456,
        }}>
          <div className="card blue row" style={{ padding: '12px 14px' }} role="status">
            <div className="spinner" style={{ borderColor: 'rgba(255,255,255,.25)', borderTopColor: '#FFD100' }} />
            <div className="grow">
              <div className="bold">Recherche d'adversaires…</div>
              <div className="tiny" style={{ opacity: .85 }}>{gameName(mm.gameId)} · <Elapsed since={mm.since || Date.now()} /></div>
            </div>
            <button className="btn sm outline-light" onClick={cancelSearch}>Annuler</button>
          </div>
        </div>
      )}
      <Sheet open={!!proposal} center label="Partie trouvée" onClose={() => {}}>
        {proposal && (
          <div className="stack lg center">
            <div>
              <div className="h2">Partie <span className="accent">trouvée !</span></div>
              <p className="muted small" style={{ marginTop: 6 }}>{gameName(proposal.gameId)} · confirme dans <b><Countdown until={proposal.expiresAt} /> s</b></p>
            </div>
            <div className="row wrap" style={{ justifyContent: 'center', gap: 16 }}>
              {proposal.players.map(p => (
                <div key={p.userId} className="stack" style={{ alignItems: 'center', gap: 4, width: 72 }}>
                  <Avatar id={p.avatar} size={52} ring={proposal.accepted?.includes(p.userId)} />
                  <span className="tiny bold" style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
                  <span className="tiny">{proposal.accepted?.includes(p.userId) ? '✅ Prêt' : '…'}</span>
                </div>
              ))}
            </div>
            {accepted ? (
              <p className="bold">En attente des autres joueurs…</p>
            ) : (
              <div className="stack">
                <button className="btn block" onClick={() => answerProposal(true)}>Accepter <span className="arrow" /></button>
                <button className="btn block ghost" onClick={() => answerProposal(false)}>Refuser</button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
