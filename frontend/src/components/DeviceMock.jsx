// Aperçu illustratif de l'application (écran d'une partie Yas Connect) dans un
// cadre de téléphone : visuel de présentation pour l'accueil public et les
// écrans de compte. Purement décoratif (aria-hidden), aucune donnée réelle.
import YasMark from './YasMark';
import Icon from './Icon';

const B = null; const Y = 'y'; const S = 's';
// Grille 7 × 6 vue de haut en bas : une partie en cours plausible.
const GRID = [
  [B, B, B, B, B, B, B],
  [B, B, B, B, B, B, B],
  [B, B, B, Y, B, B, B],
  [B, B, S, Y, B, B, B],
  [B, Y, S, S, Y, B, B],
  [S, Y, Y, S, S, B, Y],
];
const COLOR = { y: '#FFD100', s: '#5F99D2' };

export default function DeviceMock({ className }) {
  return (
    <div className={`device ${className || ''}`} aria-hidden>
      <div className="device-screen">
        <div className="dm-bar">
          <YasMark height={22} />
          <b>Yas Connect</b>
          <Icon name="menu" size={18} />
        </div>
        <div className="dm-body">
          <div className="dm-players">
            <span className="dm-player on"><i style={{ background: COLOR.y }} />Toi</span>
            <span className="dm-player"><i style={{ background: COLOR.s }} />Ton ami</span>
          </div>
          <div className="dm-turn">À toi de jouer !</div>
          <div className="dm-timer"><i /></div>
          <svg className="dm-board" viewBox="0 0 280 244">
            <rect width="280" height="244" rx="18" fill="#00377D" />
            {GRID.map((row, r) => row.map((cell, c) => (
              <circle key={`${r}-${c}`} cx={24 + c * 38.7} cy={24 + r * 39.2} r="15" fill={cell ? COLOR[cell] : '#002a60'} />
            )))}
          </svg>
          <div className="dm-hint">Touche une colonne pour jouer</div>
        </div>
        <div className="dm-nav">
          <span className="on"><Icon name="home" size={16} /></span>
          <span><Icon name="games" size={16} /></span>
          <span><Icon name="trophy" size={16} /></span>
          <span><Icon name="friends" size={16} /></span>
          <span><Icon name="user" size={16} /></span>
        </div>
      </div>
    </div>
  );
}
