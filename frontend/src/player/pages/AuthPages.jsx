import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import Plectre from '../../components/Plectre';
import YasLogo from '../../components/YasLogo';
import DeviceMock from '../../components/DeviceMock';
import Avatar, { AVATAR_IDS } from '../../components/Avatar';
import Icon from '../../components/Icon';

// Écrans de compte. Mobile : barre Sunshine Yellow avec le logo calé à gauche,
// titre sur fond jaune, formulaire dans une carte. Ordinateur : panneau jaune à
// gauche (logo, accroche, plectre officiel tenant un aperçu de l'application).
function AuthLayout({ title, subtitle, alt, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link to="/welcome" className="auth-brand-desktop" aria-label="Défi Yas — accueil"><YasLogo size={64} /></Link>
        <div className="auth-aside-copy">
          <h2>Joue. Défie.<br />Gagne !</h2>
          <p>Cartes, Connect, Penalty, Ludo : affronte tes amis et toute la communauté Yas en direct.</p>
        </div>
        <div className="auth-aside-visual" aria-hidden>
          <Plectre className="hero-plectre" color="blue" size={380} rotate={-10} />
          <DeviceMock />
        </div>
      </aside>
      <main className="auth-main">
        <header className="auth-top">
          <Link to="/welcome" className="auth-brand" aria-label="Défi Yas — accueil"><YasLogo size={48} /></Link>
          <span className="grow" />
          {alt}
        </header>
        <div className="auth-hero">
          <h1 className="h1">{title}</h1>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
        </div>
        <div className="auth-body">{children}</div>
      </main>
    </div>
  );
}

// Saisie du numéro : accepte « 412 34 56 », « +269 412 34 56 », « 00269… »
// (collage, saisie automatique) et n'en garde que les 7 chiffres locaux.
export function cleanPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length > 7 && d.startsWith('269')) d = d.slice(3);
  return d.slice(0, 7);
}
const formatPhone = (d) => [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7)].filter(Boolean).join(' ');

function PhoneInput({ id = 'phone', value, onChange, invalid, inputRef }) {
  return (
    <div className={`input-line${invalid ? ' invalid' : ''}`}>
      <span className="prefix">+269</span>
      <input id={id} ref={inputRef} type="tel" inputMode="tel" autoComplete="tel" placeholder="412 34 56"
        value={formatPhone(value)} onChange={(e) => onChange(cleanPhone(e.target.value))}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-err` : undefined} />
    </div>
  );
}

function PasswordInput({ id, value, onChange, invalid, autoComplete, inputRef }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`input-line${invalid ? ' invalid' : ''}`}>
      <input id={id} ref={inputRef} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
        onChange={e => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-err` : undefined} />
      <button type="button" className="reveal" onClick={() => setShow(s => !s)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );
}

function FieldError({ id, children }) {
  if (!children) return null;
  return <span className="error" id={id} role="alert"><Icon name="alert" size={16} />{children}</span>;
}

function ErrorText({ children }) {
  if (!children) return null;
  return <div className="alert error" role="alert"><Icon name="alert" size={20} /><span>{children}</span></div>;
}

const PHONE_HINT = '7 chiffres commençant par 4 (ex. 412 34 56)';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!/^4\d{6}$/.test(phone)) errs.phone = `Numéro invalide : ${PHONE_HINT}`;
    if (!password) errs.password = 'Saisis ton mot de passe';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(`+269${phone}`, password);
      navigate('/');
    } catch (err) {
      setErrors({ form: apiError(err) });
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Content de te revoir !" subtitle="Connecte-toi pour retrouver tes parties, tes amis et ton classement."
      alt={<Link to="/register" className="btn sm outline">Créer un compte</Link>}>
      <form className="card stack lg auth-card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="phone">Numéro de téléphone</label>
          <PhoneInput value={phone} onChange={setPhone} invalid={!!errors.phone} />
          <FieldError id="phone-err">{errors.phone}</FieldError>
        </div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <PasswordInput id="pw" value={password} onChange={setPassword} invalid={!!errors.password} autoComplete="current-password" />
          <FieldError id="pw-err">{errors.password}</FieldError>
        </div>
        <ErrorText>{errors.form}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Connexion…' : <>Se connecter <span className="arrow" /></>}</button>
        <div className="row between small wrap">
          <Link to="/reset" className="link">Mot de passe oublié</Link>
          <Link to="/register" className="link">Créer un compte</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ emailRequired: false });
  const [form, setForm] = useState({ phone: '', email: '', username: '', password: '', avatar: 'yas-01', acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const refs = { phone: useRef(null), email: useRef(null), username: useRef(null), password: useRef(null), terms: useRef(null) };
  const set = (k) => (v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined, form: undefined })); };

  useEffect(() => { playerApi.get('/auth/config').then(r => setCfg(r.data)).catch(() => {}); }, []);

  function validate() {
    const errs = {};
    const email = form.email.trim();
    if (!/^4\d{6}$/.test(form.phone)) errs.phone = `Numéro invalide : ${PHONE_HINT}`;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = 'Adresse e-mail invalide';
    if (cfg.emailRequired && !email) errs.email = 'Adresse e-mail requise';
    if (!/^[A-Za-z0-9_\-.]{3,20}$/.test(form.username)) {
      errs.username = form.username.length < 3 ? 'Au moins 3 caractères' : 'Lettres sans accent, chiffres, _ - . uniquement (pas d\'espace)';
    }
    if (form.password.length < 8) errs.password = '8 caractères minimum';
    if (!form.acceptTerms) errs.terms = 'Accepte les conditions pour continuer';
    return errs;
  }

  async function submit(e) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    const first = ['phone', 'email', 'username', 'password', 'terms'].find(k => errs[k]);
    if (first) { refs[first].current?.focus(); return; }
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim() || undefined, phone: `+269${form.phone}` });
      navigate('/');
    } catch (err) {
      // Erreurs du serveur rattachées au bon champ quand c'est possible.
      const code = err?.response?.data?.code || '';
      const msg = apiError(err);
      const field = /PHONE/.test(code) ? 'phone' : /EMAIL/.test(code) ? 'email' : /USERNAME/.test(code) ? 'username' : /PASSWORD/.test(code) ? 'password' : 'form';
      setErrors({ [field]: msg });
      if (field !== 'form') refs[field].current?.focus();
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Rejoins le Défi !" subtitle="Ton compte est gratuit et prêt en une minute."
      alt={<Link to="/login" className="btn sm outline">Se connecter</Link>}>
      <form className="card stack lg auth-card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="phone">Numéro de téléphone</label>
          <PhoneInput value={form.phone} onChange={set('phone')} invalid={!!errors.phone} inputRef={refs.phone} />
          {errors.phone ? <FieldError id="phone-err">{errors.phone}</FieldError> : <span className="help">Ton numéro reste privé : il n'est jamais affiché aux autres joueurs.</span>}
        </div>
        <div className="field">
          <label htmlFor="em">E-mail{cfg.emailRequired ? '' : ' (facultatif)'}</label>
          <div className={`input-line${errors.email ? ' invalid' : ''}`}><input id="em" ref={refs.email} type="email" inputMode="email" autoComplete="email" placeholder="toi@exemple.km" value={form.email} onChange={e => set('email')(e.target.value)} aria-invalid={!!errors.email || undefined} /></div>
          {errors.email ? <FieldError id="em-err">{errors.email}</FieldError> : <span className="help">Il te servira à récupérer ton mot de passe si tu l'oublies. Il reste privé.</span>}
        </div>
        <div className="field">
          <label htmlFor="un">Pseudonyme</label>
          <div className={`input-line${errors.username ? ' invalid' : ''}`}><input id="un" ref={refs.username} autoComplete="nickname" autoCapitalize="none" maxLength={20} value={form.username} onChange={e => set('username')(e.target.value)} aria-invalid={!!errors.username || undefined} /></div>
          {errors.username ? <FieldError id="un-err">{errors.username}</FieldError> : <span className="help">3 à 20 caractères : lettres, chiffres, _ - . (visible par les autres joueurs)</span>}
        </div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <PasswordInput id="pw" value={form.password} onChange={set('password')} invalid={!!errors.password} autoComplete="new-password" inputRef={refs.password} />
          {errors.password ? <FieldError id="pw-err">{errors.password}</FieldError> : <span className="help">8 caractères minimum.</span>}
        </div>
        <div className="field">
          <label id="av-label">Choisis ton avatar</label>
          <div className="avatar-grid" role="radiogroup" aria-labelledby="av-label">
            {AVATAR_IDS.map(id => (
              <button type="button" key={id} role="radio" aria-checked={form.avatar === id} aria-label={`Avatar ${id.replace('yas-', '')}`}
                className={form.avatar === id ? 'on' : ''} onClick={() => set('avatar')(id)}>
                <Avatar id={id} size={38} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="checkbox">
            <input ref={refs.terms} type="checkbox" checked={form.acceptTerms} onChange={e => set('acceptTerms')(e.target.checked)} />
            <span className={`box${errors.terms ? ' invalid' : ''}`}>{form.acceptTerms && <Icon name="check" size={18} />}</span>
            <span>J'accepte les <Link to="/terms" className="bold">conditions d'utilisation</Link> et la politique de confidentialité de Défi Yas.</span>
          </label>
          <FieldError id="terms-err">{errors.terms}</FieldError>
        </div>
        <ErrorText>{errors.form}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Création…' : <>Créer mon compte <span className="arrow" /></>}</button>
        <p className="small center">Déjà inscrit ? <Link to="/login" className="link">Se connecter</Link></p>
      </form>
    </AuthLayout>
  );
}

// Mot de passe oublié : demande d'un lien par e-mail, puis choix du nouveau
// mot de passe depuis le lien reçu (/reset?token=…).
export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(e) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Adresse e-mail invalide');
    setBusy(true);
    try {
      await playerApi.post('/auth/password/forgot', { email: email.trim() });
      setSent(true);
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  async function reset(e) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('8 caractères minimum');
    if (pw !== pw2) return setError('Les deux mots de passe ne sont pas identiques');
    setBusy(true);
    try {
      await playerApi.post('/auth/password/reset', { token, newPassword: pw });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={token ? 'Nouveau mot de passe' : 'Mot de passe oublié ?'}
      subtitle={token ? 'Choisis un mot de passe que tu n\'utilises pas ailleurs.' : 'Pas de panique : on t\'envoie un lien par e-mail.'}
      alt={<Link to="/login" className="btn sm outline">Se connecter</Link>}>
      <div className="card stack lg auth-card">
        {done ? (
          <div className="alert success" role="status"><Icon name="check" size={20} /> C'est fait ! Connecte-toi avec ton nouveau mot de passe.</div>
        ) : token ? (
          <form className="stack lg" onSubmit={reset}>
            <div className="field"><label htmlFor="np">Nouveau mot de passe</label><div className="input-line"><input id="np" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div><span className="help">8 caractères minimum.</span></div>
            <div className="field"><label htmlFor="np2">Confirme-le</label><div className="input-line"><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></div></div>
            <ErrorText>{error}</ErrorText>
            {error && /lien/i.test(error) && <Link to="/reset" className="link small">Demander un nouveau lien</Link>}
            <button className="btn block" disabled={busy}>{busy ? 'Enregistrement…' : <>Enregistrer <span className="arrow" /></>}</button>
          </form>
        ) : sent ? (
          <div className="stack">
            <div className="alert info" role="status"><Icon name="chat" size={20} /> Si un compte Défi Yas est lié à cette adresse, un e-mail avec un lien vient de partir. Le lien est valable 30 minutes.</div>
            <p className="small muted">Rien reçu ? Regarde dans tes spams, ou recommence dans quelques minutes.</p>
            <button className="btn block outline" onClick={() => setSent(false)}>Utiliser une autre adresse</button>
          </div>
        ) : (
          <form className="stack lg" onSubmit={request}>
            <div className="field">
              <label htmlFor="em">Ton e-mail</label>
              <div className="input-line"><input id="em" type="email" inputMode="email" autoComplete="email" placeholder="toi@exemple.km" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <span className="help">On t'envoie un lien pour choisir un nouveau mot de passe.</span>
            </div>
            <ErrorText>{error}</ErrorText>
            <button className="btn block" disabled={busy}>{busy ? 'Envoi…' : <>Recevoir le lien <span className="arrow" /></>}</button>
            <p className="small muted">Pas d'e-mail sur ton compte ? Contacte le service client Yas : un conseiller pourra te transmettre un lien de réinitialisation.</p>
          </form>
        )}
        <Link to="/login" className="link small">Retour à la connexion</Link>
      </div>
    </AuthLayout>
  );
}

export function Terms() {
  const navigate = useNavigate();
  return (
    <div className="app-frame">
      <main className="app-main no-nav stack">
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(-1)}>Retour</button>
        <h1 className="h2">Conditions d'utilisation</h1>
        <div className="card stack small" style={{ lineHeight: 1.5 }}>
          <p><b>Défi Yas</b> est une plateforme de jeux en ligne gratuite proposée par Yas Comores.</p>
          <p>Ton numéro de téléphone et ton e-mail servent uniquement à sécuriser ton compte et à récupérer ton mot de passe ; ils ne sont jamais affichés aux autres joueurs. Ton pseudonyme, ton avatar, ton niveau, tes badges et tes statistiques de jeu sont publics.</p>
          <p>Les comportements abusifs (insultes, triche, matchs arrangés, comptes multiples) peuvent entraîner une suspension ou un bannissement. Les messages du chat sont filtrés et peuvent être signalés et modérés.</p>
          <p>Les classements, points et niveaux n'ont aucune valeur monétaire. D'éventuelles récompenses ne seront proposées qu'après publication d'un règlement de campagne spécifique.</p>
          <p>Tu peux demander la suppression ou l'anonymisation de ton compte auprès du service client Yas.</p>
          <p className="muted tiny">Document provisoire — à valider par le service juridique de Yas Comores avant la mise en production.</p>
        </div>
      </main>
    </div>
  );
}
