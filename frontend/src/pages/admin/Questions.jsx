import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import api from '../../utils/api';

const COLS = [
  { key: 'id', header: 'id', width: 14 },
  { key: 'text_fr', header: 'text_fr', width: 60 },
  { key: 'answer', header: 'answer', width: 12 },
  { key: 'difficulty', header: 'difficulty', width: 14 },
  { key: 'category', header: 'category', width: 22 },
  { key: 'image_url', header: 'image_url', width: 40 },
];

// Construit un classeur Excel formaté à partir de lignes de questions
async function buildWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Questions', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

  // En-tête stylé
  const header = ws.getRow(1);
  COLS.forEach((c, i) => { header.getCell(i + 1).value = c.header; });
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00377D' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFFFD100' } } };
  });

  // Données
  rows.forEach(q => {
    ws.addRow({
      id: q.id || '',
      text_fr: q.text_fr || '',
      answer: q.answer === undefined || q.answer === null ? 'vrai' : (q.answer ? 'vrai' : 'faux'),
      difficulty: q.difficulty || 'medium',
      category: q.category || 'coupe_du_monde',
      image_url: q.image_url || '',
    });
  });

  // Menus déroulants sur les lignes (jusqu'à 500) pour faciliter la saisie
  for (let r = 2; r <= Math.max(rows.length + 1, 200); r++) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"vrai,faux"'],
      showErrorMessage: true, error: 'Choisir vrai ou faux', errorTitle: 'Valeur invalide',
    };
    ws.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"easy,medium,hard"'],
    };
    ws.getRow(r).alignment = { vertical: 'top', wrapText: true };
  }
  return wb;
}

async function downloadWorkbook(rows, filename) {
  const wb = await buildWorkbook(rows);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Lit un .xlsx uploadé et renvoie un tableau d'objets question
async function parseXLSX(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => { headers[col] = (cell.value ?? '').toString().trim().toLowerCase(); });
  const out = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell((cell, col) => {
      const key = headers[col];
      if (!key) return;
      let v = cell.value;
      if (v && typeof v === 'object' && 'text' in v) v = v.text; // hyperlink/rich text
      obj[key] = v == null ? '' : v.toString().trim();
    });
    if (Object.values(obj).some(v => v !== '')) out.push(obj);
  });
  return out;
}

const EMPTY = { id: '', text_fr: '', text_ar: '', answer: true, category: 'coupe_du_monde', difficulty: 'medium', is_active: true, image_url: '' };

// Banque d'images football (Unsplash) pour l'option "aléatoire"
const FOOTBALL_IMAGES = [
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
  'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80',
  'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&q=80',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
  'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&q=80',
  'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80',
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=80',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
  'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&q=80',
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80',
  'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&q=80',
];
const randomFootballImage = () => FOOTBALL_IMAGES[Math.floor(Math.random() * FOOTBALL_IMAGES.length)];

export default function AdminQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    const { data } = await api.get('/admin/questions');
    setQuestions(data.questions);
    setLoading(false);
  }

  function startEdit(q) {
    setEditingId(q.id);
    setForm({ ...q });
    setShowAdd(false);
  }

  async function saveEdit() {
    await api.put(`/admin/questions/${editingId}`, form);
    setEditingId(null);
    fetch();
  }

  async function saveNew() {
    await api.post('/admin/questions', form);
    setShowAdd(false);
    setForm(EMPTY);
    fetch();
  }

  async function toggleActive(q) {
    await api.put(`/admin/questions/${q.id}`, { is_active: !q.is_active });
    fetch();
  }

  const categories = [...new Set(questions.map(q => q.category))].sort();
  const filtered = questions
    .filter(q => filter === 'all' || q.is_active === (filter === 'active'))
    .filter(q => catFilter === 'all' || q.category === catFilter);

  function downloadXLSX() {
    const rows = questions.length ? questions : SAMPLE_ROWS;
    downloadWorkbook(rows, `questions_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>❓ Questions</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select style={styles.filterSelect} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="all">Tous les thèmes</option>
            {categories.map(c => <option key={c} value={c}>{c === 'coupe_du_monde' ? '⚽ Football' : c === 'comores' ? '🇰🇲 Comores' : c}</option>)}
          </select>
          <select style={styles.filterSelect} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Toutes</option>
            <option value="active">Actives</option>
            <option value="inactive">Inactives</option>
          </select>
          <button style={styles.btnBulk} onClick={downloadXLSX}>
            ⬇ Télécharger Excel
          </button>
          <button style={styles.btnBulk} onClick={() => { setShowBulk(true); setShowAdd(false); setEditingId(null); }}>
            ⬆ Import en masse
          </button>
          <button style={styles.btnAdd} onClick={() => { setShowAdd(true); setShowBulk(false); setEditingId(null); setForm(EMPTY); }}>
            + Ajouter
          </button>
        </div>
      </div>

      {showBulk && <BulkForm onClose={() => setShowBulk(false)} onDone={fetch} />}
      {showAdd && <QForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setShowAdd(false)} isNew />}

      {loading ? <p>Chargement...</p> : (
        <div style={styles.list}>
          {filtered.map(q => (
            <div key={q.id} style={{ ...styles.item, opacity: q.is_active ? 1 : 0.5 }}>
              {editingId === q.id ? (
                <QForm form={form} setForm={setForm} onSave={saveEdit} onCancel={() => setEditingId(null)} />
              ) : (
                <div style={styles.qRow}>
                  <div style={styles.qLeft}>
                    <span style={styles.qId}>{q.id}</span>
                    <p style={styles.qText}>{q.text_fr}</p>
                    <div style={styles.qMeta}>
                      <span style={{ ...styles.badge, background: q.answer ? '#dcfce7' : '#fee2e2', color: q.answer ? '#15803d' : '#b91c1c' }}>
                        {q.answer ? 'VRAI' : 'FAUX'}
                      </span>
                      <span style={styles.badge}>{q.difficulty}</span>
                      <span style={styles.badge}>{q.category}</span>
                    </div>
                  </div>
                  <div style={styles.qActions}>
                    <button style={styles.btnSm} onClick={() => startEdit(q)}>✏️</button>
                    <button
                      style={{ ...styles.btnSm, background: q.is_active ? '#fee2e2' : '#dcfce7' }}
                      onClick={() => toggleActive(q)}
                    >
                      {q.is_active ? '🔴' : '🟢'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QForm({ form, setForm, onSave, onCancel, isNew }) {
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={qfStyles.box}>
      <div style={qfStyles.grid}>
        {isNew && (
          <div style={qfStyles.field}>
            <label style={qfStyles.label}>ID (slug unique) *</label>
            <input style={qfStyles.input} value={form.id} onChange={e => f('id', e.target.value)} placeholder="ex: wc_16" />
          </div>
        )}
        <div style={{ ...qfStyles.field, gridColumn: '1/-1' }}>
          <label style={qfStyles.label}>Question (FR) *</label>
          <textarea style={{ ...qfStyles.input, resize: 'vertical', minHeight: 70 }} value={form.text_fr} onChange={e => f('text_fr', e.target.value)} />
        </div>
        <div style={qfStyles.field}>
          <label style={qfStyles.label}>Réponse correcte</label>
          <select style={qfStyles.input} value={form.answer.toString()} onChange={e => f('answer', e.target.value === 'true')}>
            <option value="true">VRAI</option>
            <option value="false">FAUX</option>
          </select>
        </div>
        <div style={qfStyles.field}>
          <label style={qfStyles.label}>Difficulté</label>
          <select style={qfStyles.input} value={form.difficulty} onChange={e => f('difficulty', e.target.value)}>
            <option value="easy">Facile</option>
            <option value="medium">Moyen</option>
            <option value="hard">Difficile</option>
          </select>
        </div>
        <div style={qfStyles.field}>
          <label style={qfStyles.label}>Catégorie</label>
          <input style={qfStyles.input} value={form.category} onChange={e => f('category', e.target.value)} />
        </div>
        <div style={{ ...qfStyles.field, gridColumn: '1/-1' }}>
          <label style={qfStyles.label}>Image de la carte (URL)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...qfStyles.input, flex: 1 }}
              value={form.image_url || ''}
              onChange={e => f('image_url', e.target.value)}
              placeholder="https://… ou cliquez sur Aléatoire"
            />
            <button type="button" style={qfStyles.btnRandom} onClick={() => f('image_url', randomFootballImage())}>
              🎲 Aléatoire
            </button>
            {form.image_url && (
              <button type="button" style={qfStyles.btnClear} onClick={() => f('image_url', '')}>✕</button>
            )}
          </div>
          {form.image_url && (
            <img src={form.image_url} alt="aperçu" style={qfStyles.preview} />
          )}
        </div>
      </div>
      <div style={qfStyles.actions}>
        <button style={qfStyles.btnSave} onClick={onSave}>Enregistrer</button>
        <button style={qfStyles.btnCancel} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// Parse CSV (gère les guillemets et les virgules dans les champs)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => r.some(c => c.trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

function parseInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    return Array.isArray(data) ? data : [data];
  }
  return parseCSV(trimmed);
}

function BulkForm({ onClose, onDone }) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setResult(null);
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const rows = await parseXLSX(buf);
        setFileRows(rows);
        setFileName(`${file.name} — ${rows.length} ligne(s) détectée(s)`);
        setText('');
      } else {
        const txt = await file.text();
        setText(txt);
        setFileRows(null);
        setFileName('');
      }
    } catch (err) {
      setError('Lecture du fichier impossible : ' + err.message);
    }
  }

  function downloadSample() {
    downloadWorkbook(SAMPLE_ROWS, 'modele_questions.xlsx');
  }

  async function doImport() {
    setError(''); setResult(null);
    let questions;
    try {
      questions = fileRows && fileRows.length ? fileRows : parseInput(text);
    } catch (err) { return setError('Format invalide : ' + err.message); }
    if (!questions.length) return setError('Aucune question détectée.');
    setBusy(true);
    try {
      const { data } = await api.post('/admin/questions/bulk', { questions });
      setResult(data);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'import');
    } finally { setBusy(false); }
  }

  return (
    <div style={qfStyles.box}>
      <p style={{ fontWeight: 800, color: '#00377D', marginBottom: 8 }}>Import en masse (Excel, CSV ou JSON)</p>
      <p style={bulkStyles.help}>
        Télécharge le modèle Excel, remplis-le (menus déroulants vrai/faux et difficulté inclus), puis ré-importe le fichier.<br />
        Un même <code>id</code> met à jour la question existante.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button type="button" style={bulkStyles.sample} onClick={downloadSample}>⬇ Modèle Excel</button>
        <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={onFile} style={bulkStyles.file} />
      </div>
      {fileName && <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: '0 0 8px' }}>📄 {fileName}</p>}
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0' }}>— ou collez du CSV / JSON ci-dessous —</p>
      <textarea
        style={{ ...qfStyles.input, width: '100%', minHeight: 130, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
        value={text}
        onChange={e => { setText(e.target.value); setFileRows(null); setFileName(''); }}
        placeholder={'id,text_fr,answer,difficulty,category,image_url\nwc_16,Le ballon est rond,vrai,easy,coupe_du_monde,'}
      />
      {error && <p style={{ color: '#b91c1c', fontWeight: 700, marginTop: 8 }}>{error}</p>}
      {result && (
        <div style={bulkStyles.result}>
          ✅ {result.inserted} ajoutée(s), {result.updated} mise(s) à jour sur {result.total}.
          {result.errors?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#b91c1c' }}>
              {result.errors.map((e, i) => <li key={i}>Ligne {e.line} : {e.error}</li>)}
            </ul>
          )}
        </div>
      )}
      <div style={qfStyles.actions}>
        <button style={qfStyles.btnSave} onClick={doImport} disabled={busy}>{busy ? 'Import…' : 'Importer'}</button>
        <button style={qfStyles.btnCancel} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

const SAMPLE_ROWS = [
  { id: 'wc_16', text_fr: 'Le ballon de foot est rond', answer: true, difficulty: 'easy', category: 'coupe_du_monde', image_url: '' },
  { id: 'wc_17', text_fr: 'Un match dure 120 minutes', answer: false, difficulty: 'medium', category: 'coupe_du_monde', image_url: '' },
];

const bulkStyles = {
  help: { fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 10 },
  file: { fontSize: 13 },
  sample: { padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  result: { marginTop: 10, padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontWeight: 700, color: '#15803d', fontSize: 14 },
};

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title: { fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', color: '#00377D', letterSpacing: 2 },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 },
  btnAdd: { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#00377D', color: '#FFD100', fontWeight: 700, cursor: 'pointer' },
  btnBulk: { padding: '8px 16px', borderRadius: 8, border: '2px solid #00377D', background: 'white', color: '#00377D', fontWeight: 700, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  qRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  qLeft: { flex: 1 },
  qId: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' },
  qText: { fontWeight: 700, color: '#111', margin: '4px 0 8px', fontSize: 15, lineHeight: 1.4 },
  qMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  badge: { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#374151' },
  qActions: { display: 'flex', gap: 6, flexShrink: 0 },
  btnSm: { width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 16 },
};

const qfStyles = {
  box: { background: '#f8faff', border: '2px solid #00377D', borderRadius: 12, padding: 16, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 700, color: '#374151' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  actions: { display: 'flex', gap: 10, marginTop: 12 },
  btnSave: { padding: '8px 20px', borderRadius: 8, border: 'none', background: '#00377D', color: '#FFD100', fontWeight: 700, cursor: 'pointer' },
  btnCancel: { padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' },
  btnRandom: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#FFD100', color: '#00377D', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnClear: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#b91c1c', fontWeight: 700 },
  preview: { marginTop: 8, width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb' },
};
