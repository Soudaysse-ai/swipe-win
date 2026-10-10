// Page d'accueil publique de Défi Yas (visiteurs non connectés).
// Construite selon la charte Yas et le guide « App Design Best Practices » :
// en-tête web sur deux rangées (barre Midnight Blue + barre Sunshine Yellow, logo
// calé à gauche), héros Sunshine Yellow avec le plectre officiel qui « tient » un
// aperçu de l'application, cartes produits, icônes dans des formes de maintien,
// bandeau Midnight Blue texturé par le Pulse officiel, bandeau d'appel à l'action
// jaune et pied de page Midnight Blue (variante principale du logo).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import YasLogo from '../../components/YasLogo';
import Pulse from '../../components/Pulse';
import GameArt from '../../components/GameArt';
import DeviceMock from '../../components/DeviceMock';
import HoldingIcon from '../../components/HoldingIcon';
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
  { icon: 'trophy', title: 'Classements en direct', text: 'Par jeu, par semaine et par saison.' },
  { icon: 'medal', title: 'Tournois', text: 'Inscris-toi et affronte les meilleurs joueurs.' },
  { icon: 'friends', title: 'Amis & chat', text: 'Invite tes amis, discute, prends ta revanche.' },
  { icon: 'star', title: 'Badges & niveaux', text: 'Chaque partie te fait progresser.' },
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
        <div className="utility-bar">
          <div className="wrap">
            <nav aria-label="Univers Yas">
              <span className="active">Défi Yas</span>
              <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores <Icon name="share" size={14} /></a>
            </nav>
            <nav aria-label="Compte">
              <a href="#comment-jouer">Aide</a>
              <Link to="/login"><Icon name="user" size={16} /> Se connecter</Link>
            </nav>
          </div>
        </div>
        <div className="main-bar">
          <div className="wrap">
            <Link to="/welcome" className="site-logo" aria-label="Défi Yas — accueil"><YasLogo size={64} /></Link>
            <nav className="main-menu" aria-label="Sections">
              {NAV.map(n => <a key={n.href} href={n.href}>{n.label}</a>)}
            </nav>
            <div className="main-actions">
              <Link to="/login" className="btn sm outline only-mobile">Se connecter</Link>
              <Link to="/register" className="btn blue only-desktop">Créer mon compte <span className="arrow" /></Link>
              <button className="icon-btn only-mobile" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Menu"><Icon name={menu ? 'close' : 'menu'} /></button>
            </div>
          </div>
          {menu && (
            <nav className="mobile-menu" aria-label="Menu">
              {NAV.map(n => <a key={n.href} href={n.href} onClick={() => setMenu(false)}>{n.label}<Icon name="chevron" size={18} /></a>)}
              <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores<Icon name="share" size={18} /></a>
              <Link to="/register" className="btn blue block">Créer mon compte <span className="arrow" /></Link>
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
            <Pulse className="hero-pulse" size={760} rotate={-8} solid plectre />
            <DeviceMock className="hero-device" />
            <div className="hero-badge"><b>+30</b><span>points de saison<br />par victoire</span></div>
          </div>
        </div>
      </section>

      <section id="jeux" className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Choisis ton <span className="hl">jeu</span></h2>
            <p>Quatre jeux, des parties de quelques minutes, contre de vrais joueurs.</p>
          </div>
          <div className="product-grid">
            {games.map(g => (
              <Link key={g.id} to="/register" className="product-card">
                <span className="product-art"><GameArt gameId={g.id} height="100%" fit="meet" /></span>
                <span className="product-body">
                  <span className="label-chip">{GAME_META[g.id]?.players}</span>
                  <b>{g.name}</b>
                  <span className="desc">{g.description}</span>
                  <span className="text-link">Jouer</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="comment-jouer" className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Comment <span className="hl">jouer ?</span></h2>
            <p>Trois étapes, et ton premier match commence.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <HoldingIcon icon={s.icon} size={72} />
                <span className="step-num">Étape {i + 1}</span>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="communaute" className="band">
        <div className="wrap">
          <div className="section-head on-dark">
            <h2>Plus qu'un jeu,<br /><span className="hl">une communauté</span></h2>
            <p>Retrouve tes amis, suis tes progrès et mesure-toi aux meilleurs joueurs des Comores.</p>
          </div>
          <div className="features">
            {FEATURES.map(f => (
              <div key={f.title} className="feature">
                <HoldingIcon icon={f.icon} size={60} />
                <b>{f.title}</b>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="wrap cta-inner">
          <div>
            <h2>Prêt à relever le défi ? Yas !</h2>
            <p>Crée ton compte gratuitement : ton premier match t'attend.</p>
          </div>
          <Link to="/register" className="btn blue lg">Créer mon compte <span className="arrow" /></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <YasLogo size={72} variant="primary" />
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
          <nav aria-label="Informations">
            <b>Informations</b>
            <Link to="/terms">Conditions d'utilisation</Link>
            <a href="https://www.yas.km" target="_blank" rel="noopener noreferrer">Yas Comores</a>
          </nav>
        </div>
        <div className="wrap footer-bottom">
          <span>© {new Date().getFullYear()} Yas. Tous droits réservés.</span>
          <span>Yas est une marque Axian Telecom.</span>
        </div>
      </footer>
    </div>
  );
}
