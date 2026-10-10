// Page d'accueil publique de Défi Yas (visiteurs non connectés).
// Charte Yas : dégradé Sunshine Yellow, titres Figtree ExtraBold Italic en
// Midnight Blue, plectre Midnight Blue derrière le visuel, Pulse jaune derrière
// l'appel à l'action, logo calé en haut à gauche.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import playerApi from '../../lib/playerApi';
import YasLogo from '../../components/YasLogo';
import Plectre from '../../components/Plectre';
import GameArt from '../../components/GameArt';
import Icon from '../../components/Icon';
import { GAME_META } from '../../lib/format';

const FALLBACK_GAMES = [
  { id: 'cards', name: 'Yas Cards', description: 'Débarrasse-toi de toutes tes cartes avant les autres.' },
  { id: 'connect', name: 'Yas Connect', description: 'Aligne 4 jetons avant ton adversaire.' },
  { id: 'penalty', name: 'Yas Penalty', description: 'Tire, plonge, marque : la séance de tirs au but.' },
  { id: 'ludo', name: 'Yas Ludo', description: 'Fais le tour du plateau avec tes 4 pions.' },
];

const STEPS = [
  { icon: 'device', title: 'Crée ton compte', text: 'Ton numéro Yas, un pseudo, un mot de passe : c\'est parti.' },
  { icon: 'zap', title: 'Lance un défi', text: 'Partie rapide, salon privé avec tes amis ou salon public : tu choisis.' },
  { icon: 'trophy', title: 'Grimpe au classement', text: 'Gagne de l\'XP, monte en ligue et tente ta chance dans les tournois.' },
];

const FEATURES = [
  { icon: 'trophy', title: 'Classements en direct', text: 'Par jeu, par semaine, par saison.' },
  { icon: 'medal', title: 'Tournois', text: 'Inscris-toi et affronte les meilleurs.' },
  { icon: 'friends', title: 'Amis & chat', text: 'Invite, discute, prends ta revanche.' },
  { icon: 'star', title: 'Badges & niveaux', text: 'Chaque partie te fait progresser.' },
];

export default function Landing() {
  const [games, setGames] = useState(FALLBACK_GAMES);
  useEffect(() => {
    playerApi.get('/games').then(r => { if (r.data.games?.length) setGames(r.data.games); }).catch(() => {});
  }, []);
  const online = games.reduce((n, g) => n + (g.playersOnline || 0), 0);

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/welcome" className="landing-brand" aria-label="Défi Yas">
          <YasLogo size={52} />
          <span>Défi</span>
        </Link>
        <nav className="landing-links" aria-label="Accès au compte">
          <Link to="/login" className="btn sm outline"><Icon name="user" size={18} /> Se connecter</Link>
          <Link to="/register" className="btn sm blue hide-mobile">Créer mon compte</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-kicker">Les jeux multijoueurs de Yas Comores</span>
          <h1>Joue, défie,<br /><span className="hl">gagne !</span></h1>
          <p>Cartes, Connect, Penalty, Ludo : affronte tes amis et toute la communauté Yas en direct, depuis ton téléphone ou ton ordinateur.</p>
          <div className="hero-cta">
            <Link to="/register" className="btn blue">Créer mon compte <span className="arrow" /></Link>
            <Link to="/login" className="btn outline">J'ai déjà un compte</Link>
          </div>
          <p className="hero-note">Gratuit · sans installation · mobile et ordinateur{online > 0 ? ` · ${online} joueur${online > 1 ? 's' : ''} en jeu` : ''}</p>
        </div>
        <div className="hero-visual" aria-hidden>
          <Plectre color="blue" size={520} rotate={-18} style={{ position: 'absolute', inset: 'auto', left: '50%', top: '50%', translate: '-50% -52%' }} />
          <div className="hero-tiles">
            {games.slice(0, 4).map((g, i) => (
              <div key={g.id} className={`hero-tile t${i}`}>
                <GameArt gameId={g.id} height="100%" fit="meet" />
                <b>{g.name.replace('Yas ', '')}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="lg-games">
        <h2 id="lg-games" className="landing-h2">Choisis ton <span className="accent">terrain de jeu</span></h2>
        <div className="landing-games">
          {games.map(g => (
            <Link key={g.id} to="/register" className="landing-game">
              <span className="art"><GameArt gameId={g.id} height="100%" fit="meet" /></span>
              <span className="body">
                <b>{g.name}</b>
                <span className="players">{GAME_META[g.id]?.players}</span>
                <span className="desc">{g.description}</span>
                <span className="link">Jouer</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-section" aria-labelledby="lg-steps">
        <h2 id="lg-steps" className="landing-h2">Comment ça <span className="accent">marche ?</span></h2>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="holding"><Icon name={s.icon} size={28} /></span>
              <span className="num">{i + 1}</span>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-band" aria-labelledby="lg-feat">
        <h2 id="lg-feat" className="landing-h2 on-blue">Plus qu'un jeu, <span className="accent">une communauté</span></h2>
        <div className="landing-features">
          {FEATURES.map(f => (
            <div key={f.title} className="feature">
              <span className="holding"><Icon name={f.icon} size={26} /></span>
              <b>{f.title}</b>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <h2 className="landing-h2">Prêt à relever le défi ? Yas !</h2>
        <p>Ton premier match t'attend.</p>
        <Link to="/register" className="btn blue">Créer mon compte <span className="arrow" /></Link>
      </section>

      <footer className="landing-footer">
        <div className="row" style={{ gap: 12 }}>
          <span className="logo-chip"><YasLogo size={44} /></span>
          <span><b>Défi Yas</b><br /><small>Yas Comores · une marque Axian Telecom</small></span>
        </div>
        <nav className="foot-links" aria-label="Liens utiles">
          <Link to="/terms">Conditions d'utilisation</Link>
          <Link to="/login">Se connecter</Link>
          <Link to="/register">Créer un compte</Link>
        </nav>
        <small className="copy">© {new Date().getFullYear()} Yas. Tous droits réservés.</small>
      </footer>
    </div>
  );
}
