import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import YasMark from '../../components/YasMark';
import Avatar, { AVATAR_IDS } from '../../components/Avatar';
import Icon from '../../components/Icon';
import { HomeScene } from '../../components/Covers';

// Portail de compte, à l'image de l'application connectée : barre Sunshine
// Yellow avec la marque, bandeau Midnight Blue illustré (la coupe et les quatre
// jeux), puis une carte unique qui chevauche le bandeau. Rien d'autre.
function AuthLayout({ title, subtitle, alt, children }) {
  return (
    <div className="portal">
      <header className="app-header portal-header">
        <Link to="/welcome" className="header-mark" aria-label="Défi Yas — accueil"><YasMark height={30} /></Link>
        <span className="grow" />
        {alt}
      </header>
      <section className="portal-hero cover">
        <HomeScene className="cover-scene" />
        <div className="cover-copy">
          <h1 className="portal-title">{title}</h1>
          {subtitle && <p className="portal-sub">{subtitle}</p>}
        </div>
      </section>
      <main className="portal-body">{children}</main>
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
const PHONE_ERROR = `Défi Yas est réservé aux numéros Yas : ${PHONE_HINT}`;

// Même règle que le serveur : lettres (accents compris), chiffres, _ - . et
// espaces simples entre les mots.
export const normalizeUsername = (v) => String(v || '').normalize('NFC').trim().replace(/\s+/g, ' ');
export function usernameError(raw) {
  const v = normalizeUsername(raw);
  if (v.length < 3) return 'Au moins 3 caractères';
  if (v.length > 20) return '20 caractères au maximum';
  if (!/^[\p{L}\p{N}_.-]+(?: [\p{L}\p{N}_.-]+)*$/u.test(v)) return 'Lettres, chiffres, espaces, _ - . uniquement (pas d\'emoji ni de @)';
  return null;
}

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
    if (!/^4\d{6}$/.test(phone)) errs.phone = PHONE_ERROR;
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
    <AuthLayout title={<>Joue. Défie. <span className="hl">Gagne&nbsp;!</span></>}
      subtitle="Cartes, Connect, Foot et Ludo en direct avec toute la communauté Yas.">
      <form className="card stack lg auth-card" onSubmit={submit} noValidate>
        <h2 className="h3">Connexion</h2>
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
        <Link to="/reset" className="link small center">Mot de passe oublié ?</Link>
        <div className="portal-sep"><span>Nouveau sur Défi Yas ?</span></div>
        <Link to="/register" className="btn block outline">Créer un compte gratuit</Link>
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
    if (!/^4\d{6}$/.test(form.phone)) errs.phone = PHONE_ERROR;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = 'Adresse e-mail invalide';
    if (cfg.emailRequired && !email) errs.email = 'Adresse e-mail requise';
    const nameErr = usernameError(form.username);
    if (nameErr) errs.username = nameErr;
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
      await register({ ...form, username: normalizeUsername(form.username), email: form.email.trim() || undefined, phone: `+269${form.phone}` });
      navigate('/');
    } catch (err) {
      // Erreurs du serveur rattachées au bon champ quand c'est possible.
      const code = err?.response?.data?.code || '';
      const msg = apiError(err);
      const field = /PHONE/.test(code) ? 'phone' : /EMAIL/.test(code) ? 'email' : /USERNAME/.test(code) ? 'username' : /PASSWORD/.test(code) ? 'password' : 'form';
      setErrors({ [field]: msg, phoneTaken: code === 'PHONE_TAKEN' });
      if (field !== 'form') refs[field].current?.focus();
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={<>Rejoins le <span className="hl">Défi</span>&nbsp;!</>} subtitle="Ton compte est gratuit et prêt en une minute."
      alt={<Link to="/login" className="btn sm blue">Se connecter</Link>}>
      <form className="card stack lg auth-card" onSubmit={submit} noValidate>
        <h2 className="h3">Créer un compte</h2>
        <div className="field">
          <label htmlFor="phone">Numéro de téléphone</label>
          <PhoneInput value={form.phone} onChange={set('phone')} invalid={!!errors.phone} inputRef={refs.phone} />
          {errors.phone ? <FieldError id="phone-err">{errors.phone}</FieldError> : <span className="help">Ton numéro reste privé : il n'est jamais affiché aux autres joueurs.</span>}
          {errors.phoneTaken && <span className="help">C'est ton numéro ? <Link to="/login" className="link">Connecte-toi</Link> ou <Link to="/reset" className="link">récupère ton compte</Link>.</span>}
        </div>
        <div className="field">
          <label htmlFor="em">E-mail{cfg.emailRequired ? '' : ' (facultatif)'}</label>
          <div className={`input-line${errors.email ? ' invalid' : ''}`}><input id="em" ref={refs.email} type="email" inputMode="email" autoComplete="email" placeholder="toi@exemple.km" value={form.email} onChange={e => set('email')(e.target.value)} aria-invalid={!!errors.email || undefined} /></div>
          {errors.email ? <FieldError id="em-err">{errors.email}</FieldError> : <span className="help">Conseillé : c'est le moyen le plus simple de récupérer ton compte si tu oublies ton mot de passe. Il reste privé.</span>}
        </div>
        <div className="field">
          <label htmlFor="un">Pseudonyme</label>
          <div className={`input-line${errors.username ? ' invalid' : ''}`}><input id="un" ref={refs.username} autoComplete="nickname" maxLength={24} value={form.username} onChange={e => set('username')(e.target.value)} aria-invalid={!!errors.username || undefined} /></div>
          {errors.username ? <FieldError id="un-err">{errors.username}</FieldError> : <span className="help">3 à 20 caractères, accents et espaces acceptés (visible par les autres joueurs)</span>}
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

// Mot de passe oublié, à partir du numéro :
//  - le compte a un e-mail → le lien part tout de suite (adresse masquée affichée) ;
//  - pas d'e-mail (ou plus d'accès) → demande au service client : un conseiller
//    rappelle le numéro Yas pour vérifier l'identité, puis envoie le lien.
// Le lien reçu ramène ici (/reset?token=…) pour choisir le nouveau mot de passe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [step, setStep] = useState('phone'); // phone | sent | none | request | requested | email | emailSent
  const [phone, setPhone] = useState('');
  const [hint, setHint] = useState(null);
  const [hasEmail, setHasEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (s) => { setError(''); setStep(s); };

  async function byPhone(e) {
    e.preventDefault();
    setError('');
    if (!/^4\d{6}$/.test(phone)) return setError(PHONE_ERROR);
    setBusy(true);
    try {
      const { data } = await playerApi.post('/auth/password/forgot-phone', { phone: `+269${phone}` });
      if (data.method === 'email') { setHint(data); go('sent'); } else if (data.method === 'request') { setHasEmail(!!data.hasEmail); go('request'); } else go('none');
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  async function sendRequest(e) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Adresse e-mail invalide');
    setBusy(true);
    try {
      await playerApi.post('/auth/recovery', { phone: `+269${phone}`, email: email.trim(), note: note.trim() || undefined });
      go('requested');
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  async function byEmail(e) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Adresse e-mail invalide');
    setBusy(true);
    try {
      await playerApi.post('/auth/password/forgot', { email: email.trim() });
      go('emailSent');
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  if (token) return <ChooseNewPassword token={token} />;

  const shown = `+269 ${formatPhone(phone)}`;
  return (
    <AuthLayout title={<>Mot de passe <span className="hl">oublié</span>&nbsp;?</>}
      subtitle="Pas de panique : on t'aide à retrouver ton compte."
      alt={<Link to="/login" className="btn sm blue">Se connecter</Link>}>
      <div className="card stack lg auth-card">
        {step === 'phone' && (
          <form className="stack lg" onSubmit={byPhone} noValidate>
            <h2 className="h3">Retrouver mon compte</h2>
            <div className="field">
              <label htmlFor="phone">Ton numéro de téléphone</label>
              <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(''); }} invalid={!!error} />
              <span className="help">Le numéro avec lequel tu t'es inscrit.</span>
            </div>
            <ErrorText>{error}</ErrorText>
            <button className="btn block" disabled={busy}>{busy ? 'Recherche…' : <>Continuer <span className="arrow" /></>}</button>
            <button type="button" className="link small center" onClick={() => go('email')}>Utiliser mon e-mail à la place</button>
          </form>
        )}

        {step === 'sent' && (
          <div className="stack lg">
            <div className="alert success" role="status"><Icon name="check" size={20} /><span>Lien envoyé à <b>{hint.emailHint}</b>. Il est valable {hint.expiresInMinutes} minutes.</span></div>
            <p className="small">Ouvre l'e-mail « Choisis ton nouveau mot de passe Défi Yas » et touche le bouton. Rien reçu ? Regarde dans les spams.</p>
            <button className="btn block outline" onClick={() => { setHasEmail(true); go('request'); }}>Je n'ai plus accès à cette adresse</button>
          </div>
        )}

        {step === 'none' && (
          <div className="stack lg">
            <div className="alert error" role="alert"><Icon name="alert" size={20} /><span>Aucun compte Défi Yas avec le numéro <b>{shown}</b>.</span></div>
            <Link to="/register" className="btn block">Créer un compte <span className="arrow" /></Link>
            <button className="btn block outline" onClick={() => go('phone')}>Essayer un autre numéro</button>
          </div>
        )}

        {step === 'request' && (
          <form className="stack lg" onSubmit={sendRequest} noValidate>
            <h2 className="h3">Demande au service client</h2>
            <p className="small">
              {hasEmail ? 'Indique ta nouvelle adresse e-mail.' : "Ton compte n'a pas encore d'adresse e-mail. Indique celle où recevoir ton lien."}
              {' '}Un conseiller Yas t'appelle au <b>{shown}</b> pour vérifier que c'est bien toi, puis t'envoie le lien.
            </p>
            <div className="field">
              <label htmlFor="rem">E-mail où recevoir le lien</label>
              <div className="input-line"><input id="rem" type="email" inputMode="email" autoComplete="email" placeholder="toi@exemple.km" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <span className="help">Elle sera enregistrée sur ton compte pour la prochaine fois.</span>
            </div>
            <div className="field">
              <label htmlFor="rnote">Un détail pour t'identifier (facultatif)</label>
              <div className="input-line"><input id="rnote" maxLength={300} placeholder="Ton pseudo, ton jeu préféré…" value={note} onChange={e => setNote(e.target.value)} /></div>
            </div>
            <ErrorText>{error}</ErrorText>
            <button className="btn block" disabled={busy}>{busy ? 'Envoi…' : <>Envoyer ma demande <span className="arrow" /></>}</button>
          </form>
        )}

        {step === 'requested' && (
          <div className="stack lg">
            <div className="alert success" role="status"><Icon name="check" size={20} /><span>Demande envoyée ! Un conseiller Yas va t'appeler au <b>{shown}</b>.</span></div>
            <p className="small">Après vérification, tu recevras le lien à <b>{email.trim()}</b>. Garde ton téléphone à portée de main.</p>
          </div>
        )}

        {step === 'email' && (
          <form className="stack lg" onSubmit={byEmail} noValidate>
            <h2 className="h3">Recevoir un lien par e-mail</h2>
            <div className="field">
              <label htmlFor="em">Ton e-mail</label>
              <div className="input-line"><input id="em" type="email" inputMode="email" autoComplete="email" placeholder="toi@exemple.km" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <span className="help">L'adresse enregistrée sur ton compte.</span>
            </div>
            <ErrorText>{error}</ErrorText>
            <button className="btn block" disabled={busy}>{busy ? 'Envoi…' : <>Recevoir le lien <span className="arrow" /></>}</button>
            <button type="button" className="link small center" onClick={() => go('phone')}>Utiliser mon numéro à la place</button>
          </form>
        )}

        {step === 'emailSent' && (
          <div className="stack lg">
            <div className="alert info" role="status"><Icon name="chat" size={20} /><span>Si un compte Défi Yas est lié à cette adresse, un e-mail avec un lien vient de partir. Le lien est valable 30 minutes.</span></div>
            <p className="small muted">Rien reçu ? Regarde dans tes spams, ou retrouve ton compte avec ton numéro.</p>
            <button className="btn block outline" onClick={() => go('phone')}>Utiliser mon numéro</button>
          </div>
        )}

        <Link to="/login" className="link small center">Retour à la connexion</Link>
      </div>
    </AuthLayout>
  );
}

function ChooseNewPassword({ token }) {
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <AuthLayout title={<>Nouveau <span className="hl">mot de passe</span></>} subtitle="Choisis un mot de passe que tu n'utilises pas ailleurs."
      alt={<Link to="/login" className="btn sm blue">Se connecter</Link>}>
      <div className="card stack lg auth-card">
        {done ? (
          <div className="alert success" role="status"><Icon name="check" size={20} /> C'est fait ! Connecte-toi avec ton nouveau mot de passe.</div>
        ) : (
          <form className="stack lg" onSubmit={reset}>
            <div className="field"><label htmlFor="np">Nouveau mot de passe</label><PasswordInput id="np" value={pw} onChange={setPw} autoComplete="new-password" /><span className="help">8 caractères minimum.</span></div>
            <div className="field"><label htmlFor="np2">Confirme-le</label><PasswordInput id="np2" value={pw2} onChange={setPw2} autoComplete="new-password" /></div>
            <ErrorText>{error}</ErrorText>
            {error && /lien/i.test(error) && <Link to="/reset" className="link small">Demander un nouveau lien</Link>}
            <button className="btn block" disabled={busy}>{busy ? 'Enregistrement…' : <>Enregistrer <span className="arrow" /></>}</button>
          </form>
        )}
        <Link to="/login" className="link small center">Retour à la connexion</Link>
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
