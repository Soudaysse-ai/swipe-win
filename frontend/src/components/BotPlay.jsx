// « Jouer contre un bot » : choix du niveau (et du nombre de bots pour les jeux
// à plusieurs), puis lancement immédiat d'une partie d'entraînement.
import { useState } from 'react';
import { useSession } from '../player/SessionContext';
import { useToast } from '../player/ToastContext';
import { Sheet } from './ui';
import Icon from './Icon';

export const BOT_LEVELS = [['easy', 'Facile'], ['normal', 'Normal'], ['hard', 'Difficile']];
export const levelLabel = (level) => (BOT_LEVELS.find(([k]) => k === level) || BOT_LEVELS[1])[1];

const KEY = 'defiyas.bot';

// Derniers réglages utilisés (confort sur cet appareil uniquement).
export function lastBotSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { level: BOT_LEVELS.some(([k]) => k === v.level) ? v.level : 'normal', opponents: Number(v.opponents) || 1 };
  } catch {
    return { level: 'normal', opponents: 1 };
  }
}

export function saveBotSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible : sans conséquence */ }
}

export function LevelTabs({ value, onChange }) {
  return (
    <div className="tabs" role="tablist" aria-label="Niveau du bot">
      {BOT_LEVELS.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k}
          className={`tab${value === k ? ' active' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function BotSheet({ open, onClose, game }) {
  const { playBot } = useSession();
  const { toast } = useToast();
  const saved = lastBotSettings();
  const [level, setLevel] = useState(saved.level);
  const maxBots = Math.max(1, (game?.maxPlayers || 2) - 1);
  const [opponents, setOpponents] = useState(Math.min(saved.opponents, maxBots));
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const settings = { level, opponents: Math.min(opponents, maxBots) };
    saveBotSettings(settings);
    try {
      await playBot(game.id, settings);
      onClose();
    } catch (err) {
      toast(err.message, { icon: '⚠️' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Jouer contre un bot">
      <div className="stack lg">
        <div>
          <h2 className="h2">Jouer seul contre un <span className="accent">bot</span></h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            Personne n'est disponible : le bot joue tout de suite avec toi. C'est une partie d'entraînement, elle ne compte pas pour le classement.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="small bold">Niveau</span>
          <LevelTabs value={level} onChange={setLevel} />
        </div>
        {maxBots > 1 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="small bold">Nombre de bots</span>
            <div className="tabs" role="tablist" aria-label="Nombre de bots">
              {Array.from({ length: maxBots }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" role="tab" aria-selected={opponents === n}
                  className={`tab${opponents === n ? ' active' : ''}`} onClick={() => setOpponents(n)}>{n}</button>
              ))}
            </div>
          </div>
        )}
        <button className="btn block" onClick={start} disabled={busy}>
          {busy ? 'Lancement…' : <><Icon name="bot" size={20} /> Lancer la partie <span className="arrow" /></>}
        </button>
      </div>
    </Sheet>
  );
}
