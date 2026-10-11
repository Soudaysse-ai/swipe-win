// Page d'accueil publique de Défi Yas (visiteurs non connectés), dans l'esprit des
// pages web Yas (« Curves ») : barre Sunshine Yellow sur une rangée (logo calé à
// gauche, liens séparés par des filets), héros jaune, sections blanches et jaune
// très clair, titres deux tons (Sky Blue puis Midnight Blue), plectres tournés
// avec halo, blocs texte / visuel alternés, bandeau jaune et pied de page bleu.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import YasLogo from '../../components/YasLogo';
import Plectre from '../../components/Plectre';
import GameArt from '../../components/GameArt';
import DeviceMock from '../../components/DeviceMock';
import PlectreFrame from '../../components/PlectreFrame';
import Icon from '../../components/Icon';
import { GAME_META } from '../../lib/format';

const FALLBACK_GAMES = [
  { id: 'cards', name: 'Yas Cards', description: 'Débarrasse-toi de toutes tes cartes avant les autres.' },
  { id: 'connect', name: 'Yas Connect', description: 'Aligne 4 jetons avant ton adversaire.' },
  { id: 'penalty', name: 'Yas Penalty', description: 'Tire, plonge, marque : la séance de tirs au but.' },
  { id: 'ludo', name: 'Yas Ludo', description: 'Fais le tour du plateau avec tes 4 pions.' },
];

const STEPS = [
  { icon: 'device', title: 'Crée ton compte', text: 'Ton numéro Yas, un pseudo et un mot de passe : en une minute, c\'est prêt.' },
  { icon: 'zap', title: 'Lance un défi', text: 'Partie rapide contre un joueur de ton niveau, ou salon privé avec tes amis.' },
  { icon: 'trophy', title: 'Grimpe au classement', text: 'Chaque victoire te rapporte de l\'XP et des points de saison.' },
];

const FEATURES = [
  { icon: 'trophy', title: 'Classements en direct' },
  { icon: 'medal', title: 'Tournois' },
  { icon: 'friends', title: 'Amis & chat' },
  { icon: 'star', title: 'Badges & niveaux' },
];

const NAV = [
  { href: '#jeux', label: 'Les jeux' },
  { href: '#comment-jouer', label: 'Comment jouer' },
  { href: '#communaute', label: 'La communauté' },
];

export default function Landing() {
  const [games, setGames] = useState(FALLBACK_GAMES);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    playerApi.get('/games').then(r => { if (r.data.games?.length) setGames(r.data.games); }).catch(() => {});
  }, []);
  const online = games.reduce((n, g) => n + (g.playersOnline || 0), 0);

  return (
    <div className="landing">
      <header className="site-header">
        <div className="main-bar">
          <div className="wrap">
            <Link to="/welcome" className="site-logo" aria-label="Défi Yas — accueil"><YasLogo size={64} /></Link>
            <nav className="main-menu" aria-label="Sections">
              {NAV.map(n => <a key={n.href} href={n.href}>{n.label}</a>)}
              <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores</a>
            </nav>
            <div className="main-actions">
              <Link to="/login" className="bar-link only-desktop"><Icon name="user" size={18} /> Se connecter</Link>
              <Link to="/register" className="btn sm blue">Créer un compte <span className="arrow" /></Link>
              <button className="icon-btn only-mobile" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Menu"><Icon name={menu ? 'close' : 'menu'} /></button>
            </div>
          </div>
          {menu && (
            <nav className="mobile-menu" aria-label="Menu">
              {NAV.map(n => <a key={n.href} href={n.href} onClick={() => setMenu(false)}>{n.label}<Icon name="chevron" size={18} /></a>)}
              <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores<Icon name="share" size={18} /></a>
              <Link to="/login">Se connecter<Icon name="chevron" size={18} /></Link>
            </nav>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="hero-eyebrow">Les jeux multijoueurs de Yas Comores</p>
            <h1>Joue. Défie.<br />Gagne !</h1>
            <p className="hero-lead">Cartes, Connect, Penalty, Ludo : affronte tes amis et toute la communauté Yas en direct, depuis ton téléphone ou ton ordinateur.</p>
            <div className="hero-cta">
              <Link to="/register" className="btn blue lg">Créer mon compte <span className="arrow" /></Link>
              <Link to="/login" className="btn outline lg">Se connecter</Link>
            </div>
            <ul className="hero-facts">
              <li><Icon name="check" size={18} /> Gratuit</li>
              <li><Icon name="check" size={18} /> Sans installation</li>
              <li><Icon name="check" size={18} /> Mobile et ordinateur</li>
            </ul>
            {online > 0 && <p className="hero-live"><span className="dot" /> {online} joueur{online > 1 ? 's' : ''} en partie en ce moment</p>}
          </div>
          <div className="hero-visual" aria-hidden>
            <Plectre className="hero-plectre" color="blue" size={460} rotate={-10} />
            <DeviceMock className="hero-device" />
          </div>
        </div>
      </section>

      <section id="jeux" className="section tint">
        <div className="wrap">
          <div className="section-head center">
            <h2><span className="hl">Quatre jeux</span> pour te défier</h2>
            <p>Des parties de quelques minutes, contre de vrais joueurs, à tout moment de la journée.</p>
          </div>
          <div className="game-showcase">
            {games.map(g => (
              <Link key={g.id} to="/register" className="showcase-item">
                <PlectreFrame size={180} halo={GAME_META[g.id]?.tint}><GameArt gameId={g.id} height="100%" fit="meet" /></PlectreFrame>
                <b>{g.name}</b>
                <span className="players">{GAME_META[g.id]?.players}</span>
                <span className="desc">{g.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="comment-jouer" className="section">
        <div className="wrap split">
          <div className="split-copy">
            <h2 className="split-title"><span className="hl">Trois étapes,</span> et ton premier match commence</h2>
            <p className="split-lead">Pas d'application à installer : Défi Yas fonctionne directement dans ton navigateur, sur mobile comme sur ordinateur.</p>
            <Link to="/register" className="btn sm blue">Créer mon compte <span className="arrow" /></Link>
          </div>
          <ol className="step-list">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <PlectreFrame size={76} fill="#FFD100"><Icon name={s.icon} size={26} /></PlectreFrame>
                <div>
                  <span className="step-num">Étape {i + 1}</span>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="communaute" className="section">
        <div className="wrap split reverse">
          <div className="feature-panel">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-cell">
                <PlectreFrame size={92} fill="#00377D" halo="#FFE369"><Icon name={f.icon} size={30} /></PlectreFrame>
                <b>{f.title}</b>
              </div>
            ))}
          </div>
          <div className="split-copy">
            <h2 className="split-title"><span className="hl">Plus qu'un jeu,</span> une communauté</h2>
            <p className="split-lead">Chaque semaine, mesure-toi aux meilleurs joueurs des Comores et grimpe dans le classement de ton jeu préféré.</p>
            <ul className="check-list">
              <li><Icon name="check" size={18} /> Classements par jeu, par semaine et par saison</li>
              <li><Icon name="check" size={18} /> Tournois ouverts à tous les joueurs</li>
              <li><Icon name="check" size={18} /> Invite tes amis, discute et prends ta revanche</li>
              <li><Icon name="check" size={18} /> Des badges et des niveaux à débloquer</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="wrap cta-inner">
          <h2>Prêt à relever le défi ? Yas !</h2>
          <p>Crée ton compte gratuitement : ton premier match t'attend.</p>
          <Link to="/register" className="btn blue">Créer mon compte <span className="arrow" /></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <YasLogo size={64} variant="primary" />
            <p>Défi Yas, la plateforme de jeux multijoueurs de Yas Comores.</p>
          </div>
          <nav aria-label="Défi Yas">
            <b>Défi Yas</b>
            {NAV.map(n => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <nav aria-label="Mon compte">
            <b>Mon compte</b>
            <Link to="/register">Créer un compte</Link>
            <Link to="/login">Se connecter</Link>
            <Link to="/reset">Mot de passe oublié</Link>
          </nav>
          <nav aria-label="Informations utiles">
            <b>Informations utiles</b>
            <Link to="/terms">Conditions d'utilisation</Link>
            <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores</a>
          </nav>
        </div>
        <div className="wrap footer-bottom">
          <span>© {new Date().getFullYear()} Yas. Tous droits réservés.</span>
          <Link to="/terms">Conditions d'utilisation</Link>
        </div>
      </footer>
    </div>
  );
}
