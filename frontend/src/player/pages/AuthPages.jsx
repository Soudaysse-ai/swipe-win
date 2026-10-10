import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import playerApi, { apiError } from '../../lib/playerApi';
import { useAuth } from '../AuthContext';
import Plectre from '../../components/Plectre';
import YasLogo from '../../components/YasLogo';
import Avatar, { AVATAR_IDS } from '../../components/Avatar';
import Icon from '../../components/Icon';

function BrandLayout({ children, compact = false }) {
  return (
    <div className="app-frame" style={{ background: 'var(--yas-blue)' }}>
      <div className="brand-screen" style={{ minHeight: '100dvh' }}>
        <div className="plectre-bg" style={{ top: compact ? -330 : -260, right: -170 }}>
          <Plectre color="yellow" size={460} rotate={-35} style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,.2))' }} />
          <div style={{ position: 'absolute', top: compact ? 330 : 270, right: 150 }}><YasLogo size={compact ? 90 : 150} /></div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, marginTop: compact ? 150 : 250, padding: '0 20px 32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function PhoneInput({ value, onChange, invalid }) {
  return (
    <div className={`input-line${invalid ? ' invalid' : ''}`}>
      <span className="prefix">+269</span>
      <input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="4XX XX XX" maxLength={7}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} aria-label="Numéro de téléphone" />
    </div>
  );
}

function ErrorText({ children }) {
  if (!children) return null;
  return <div className="field"><div className="error" role="alert"><Icon name="alert" size={18} />{children}</div></div>;
}

export function Welcome() {
  return (
    <BrandLayout>
      <h1 style={{ font: 'italic 800 48px/1 var(--yas-font)' }}>
        Défi <span style={{ color: 'var(--yas-yellow)' }}>Yas</span>
      </h1>
      <p style={{ fontSize: 20, marginTop: 12, lineHeight: 1.3 }}>
        Joue à <b>Yas Cards</b>, <b>Connect</b>, <b>Penalty</b> et <b>Ludo</b> contre tes amis et toute la communauté.
      </p>
      <div className="stack" style={{ marginTop: 'auto', paddingTop: 32 }}>
        <Link to="/register" className="btn block">Créer mon compte <span className="arrow" /></Link>
        <Link to="/login" className="btn block outline-light">J'ai déjà un compte</Link>
        <p className="tiny center" style={{ opacity: .8, marginTop: 8 }}>Gratuit · aucune installation · joue depuis ton navigateur</p>
      </div>
    </BrandLayout>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!/^4\d{6}$/.test(phone)) return setError('Numéro invalide (7 chiffres commençant par 4)');
    setBusy(true);
    try {
      await login(`+269${phone}`, password);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally { setBusy(false); }
  }

  return (
    <BrandLayout compact>
      <h1 className="h1">Content de te <span className="accent-yellow">revoir !</span></h1>
      <form className="card stack lg" style={{ marginTop: 20, color: 'var(--yas-blue)' }} onSubmit={submit}>
        <div className="field"><label>Numéro de téléphone</label><PhoneInput value={phone} onChange={setPhone} /></div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <div className="input-line"><input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Connexion…' : <>Se connecter <span className="arrow" /></>}</button>
        <div className="row between small">
          <Link to="/reset" className="link">Mot de passe oublié</Link>
          <Link to="/register" className="link">Créer un compte</Link>
        </div>
      </form>
    </BrandLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ otpRequired: false });
  const [form, setForm] = useState({ phone: '', username: '', password: '', avatar: 'yas-01', acceptTerms: false, otpCode: '' });
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { playerApi.get('/auth/config').then(r => setCfg(r.data)).catch(() => {}); }, []);

  async function sendCode() {
    setError('');
    if (!/^4\d{6}$/.test(form.phone)) return setError('Numéro invalide (7 chiffres commençant par 4)');
    try {
      await playerApi.post('/auth/otp/request', { phone: `+269${form.phone}`, purpose: 'register' });
      setCodeSent(true);
    } catch (err) { setError(apiError(err)); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!/^4\d{6}$/.test(form.phone)) return setError('Numéro invalide (7 chiffres commençant par 4)');
    if (!/^[A-Za-z0-9_\-.]{3,20}$/.test(form.username)) return setError('Pseudonyme : 3 à 20 caractères (lettres, chiffres, _ - .)');
    if (form.password.length < 8) return setError('Mot de passe : 8 caractères minimum');
    if (!form.acceptTerms) return setError('Accepte les conditions pour continuer');
    if (cfg.otpRequired && !/^\d{6}$/.test(form.otpCode)) return setError('Saisis le code reçu par SMS');
    setBusy(true);
    try {
      await register({ ...form, phone: `+269${form.phone}` });
      navigate('/');
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <BrandLayout compact>
      <h1 className="h1">Rejoins le <span className="accent-yellow">Défi !</span></h1>
      <form className="card stack lg" style={{ marginTop: 20, color: 'var(--yas-blue)' }} onSubmit={submit}>
        <div className="field">
          <label>Numéro de téléphone</label>
          <PhoneInput value={form.phone} onChange={set('phone')} />
          <span className="help">Ton numéro reste privé : il n'est jamais affiché aux autres joueurs.</span>
        </div>
        {cfg.otpRequired && (
          <div className="field">
            <label htmlFor="otp">Code de vérification</label>
            <div className="row">
              <div className="input-line grow"><input id="otp" inputMode="numeric" maxLength={6} placeholder="000000" value={form.otpCode} onChange={e => set('otpCode')(e.target.value.replace(/\D/g, ''))} /></div>
              <button type="button" className="btn sm blue" onClick={sendCode}>{codeSent ? 'Renvoyer' : 'Recevoir'}</button>
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="un">Pseudonyme</label>
          <div className="input-line"><input id="un" autoComplete="nickname" maxLength={20} value={form.username} onChange={e => set('username')(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <div className="input-line"><input id="pw" type="password" autoComplete="new-password" value={form.password} onChange={e => set('password')(e.target.value)} /></div>
          <span className="help">8 caractères minimum.</span>
        </div>
        <div className="field">
          <label>Choisis ton avatar</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }} role="radiogroup" aria-label="Avatar">
            {AVATAR_IDS.map(id => (
              <button type="button" key={id} role="radio" aria-checked={form.avatar === id} onClick={() => set('avatar')(id)}
                style={{ borderRadius: '50%', padding: 2, boxShadow: form.avatar === id ? '0 0 0 3px var(--yas-blue)' : 'none' }}>
                <Avatar id={id} size={34} />
              </button>
            ))}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.acceptTerms} onChange={e => set('acceptTerms')(e.target.checked)} />
          <span className="box">{form.acceptTerms && <Icon name="check" size={18} />}</span>
          <span>J'accepte les <Link to="/terms" className="bold">conditions d'utilisation</Link> et la politique de confidentialité de Défi Yas.</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Création…' : <>Créer mon compte <span className="arrow" /></>}</button>
        <p className="small center">Déjà inscrit ? <Link to="/login" className="link">Se connecter</Link></p>
      </form>
    </BrandLayout>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function request(e) {
    e.preventDefault();
    setError('');
    if (!/^4\d{6}$/.test(phone)) return setError('Numéro invalide');
    try {
      await playerApi.post('/auth/otp/request', { phone: `+269${phone}`, purpose: 'reset' });
      setStep(2);
    } catch (err) { setError(apiError(err)); }
  }
  async function reset(e) {
    e.preventDefault();
    setError('');
    try {
      await playerApi.post('/auth/password/reset', { phone: `+269${phone}`, code, newPassword: pw });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) { setError(apiError(err)); }
  }

  return (
    <BrandLayout compact>
      <h1 className="h1">Nouveau <span className="accent-yellow">mot de passe</span></h1>
      <div className="card stack lg" style={{ marginTop: 20, color: 'var(--yas-blue)' }}>
        {done ? <div className="alert success">✅ Mot de passe modifié. Connecte-toi !</div> : step === 1 ? (
          <form className="stack lg" onSubmit={request}>
            <div className="field"><label>Numéro de téléphone</label><PhoneInput value={phone} onChange={setPhone} /></div>
            <p className="small muted">Tu vas recevoir un code par SMS. Sans accès à ton numéro, contacte le service client Yas : un conseiller pourra te transmettre un code de réinitialisation.</p>
            <ErrorText>{error}</ErrorText>
            <button className="btn block">Recevoir un code <span className="arrow" /></button>
          </form>
        ) : (
          <form className="stack lg" onSubmit={reset}>
            <div className="field"><label htmlFor="c">Code reçu</label><div className="input-line"><input id="c" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div></div>
            <div className="field"><label htmlFor="np">Nouveau mot de passe</label><div className="input-line"><input id="np" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div></div>
            <ErrorText>{error}</ErrorText>
            <button className="btn block">Valider <span className="arrow" /></button>
          </form>
        )}
        <Link to="/login" className="link small">Retour à la connexion</Link>
      </div>
    </BrandLayout>
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
          <p>Ton numéro de téléphone sert uniquement à sécuriser ton compte ; il n'est jamais affiché aux autres joueurs. Ton pseudonyme, ton avatar, ton niveau, tes badges et tes statistiques de jeu sont publics.</p>
          <p>Les comportements abusifs (insultes, triche, matchs arrangés, comptes multiples) peuvent entraîner une suspension ou un bannissement. Les messages du chat sont filtrés et peuvent être signalés et modérés.</p>
          <p>Les classements, points et niveaux n'ont aucune valeur monétaire. D'éventuelles récompenses ne seront proposées qu'après publication d'un règlement de campagne spécifique.</p>
          <p>Tu peux demander la suppression ou l'anonymisation de ton compte auprès du service client Yas.</p>
          <p className="muted tiny">Document provisoire — à valider par le service juridique de Yas Comores avant la mise en production.</p>
        </div>
      </main>
    </div>
  );
}
