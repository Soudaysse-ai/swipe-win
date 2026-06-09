import { useEffect, useState } from 'react';
import api from '../../utils/api';

const TIERS = [
  { value: '1er_prix', label: '1er prix' },
  { value: '2eme_prix', label: '2ème prix' },
  { value: '3eme_prix', label: '3ème prix' },
];
const EMPTY_FORM = { label: '', description: '', image_url: '', tier: '1er_prix', quantity: 1, is_active: true };

export default function AdminPrizes() {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [prizesEnabled, setPrizesEnabled] = useState(true);

  useEffect(() => { fetchPrizes(); fetchSetting(); }, []);

  async function fetchPrizes() {
    const { data } = await api.get('/admin/prizes');
    setPrizes(data.prizes);
    setLoading(false);
  }

  async function fetchSetting() {
    try {
      const { data } = await api.get('/admin/settings/prizes-enabled');
      setPrizesEnabled(data.enabled);
    } catch { /* ignore */ }
  }

  async function togglePrizesEnabled() {
    const next = !prizesEnabled;
    setPrizesEnabled(next);
    try {
      await api.put('/admin/settings/prizes-enabled', { enabled: next });
    } catch {
      setPrizesEnabled(!next); // rollback en cas d'erreur
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({ label: p.label, description: p.description || '', image_url: p.image_url || '', tier: p.tier, quantity: p.quantity, is_active: p.is_active });
    setShowAdd(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.put(`/admin/prizes/${editingId}`, form);
      setEditingId(null);
      fetchPrizes();
    } finally { setSaving(false); }
  }

  async function saveNew() {
    setSaving(true);
    try {
      await api.post('/admin/prizes', form);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchPrizes();
    } finally { setSaving(false); }
  }

  async function deletePrize(id) {
    await api.delete(`/admin/prizes/${id}`);
    setConfirmDelete(null);
    fetchPrizes();
  }

  const tierColors = { '1er_prix': '#FFD100', '2eme_prix': '#94a3b8', '3eme_prix': '#cd7f32' };
  const tierLabels = { '1er_prix': '1er prix', '2eme_prix': '2ème prix', '3eme_prix': '3ème prix' };

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>🎁 Gestion des Lots</h2>
        <button style={styles.btnAdd} onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_FORM); }}>
          + Ajouter un lot
        </button>
      </div>

      <div style={styles.toggleBar}>
        <div>
          <div style={styles.toggleTitle}>Distribuer des lots</div>
          <div style={styles.toggleHint}>
            {prizesEnabled
              ? 'Les joueurs voient les lots à la fin du jeu.'
              : 'Mode sans lots : aucun cadeau n\'est affiché aux joueurs.'}
          </div>
        </div>
        <button
          type="button"
          onClick={togglePrizesEnabled}
          style={{ ...styles.switch, background: prizesEnabled ? '#22C55E' : '#cbd5e1' }}
          aria-label="Activer ou désactiver les lots"
        >
          <span style={{ ...styles.switchKnob, transform: prizesEnabled ? 'translateX(24px)' : 'translateX(0)' }} />
        </button>
      </div>

      {showAdd && (
        <PrizeForm
          form={form}
          setForm={setForm}
          onSave={saveNew}
          onCancel={() => setShowAdd(false)}
          saving={saving}
          title="Nouveau lot"
        />
      )}

      {loading ? <p>Chargement...</p> : (
        <div style={styles.grid}>
          {prizes.map(p => (
            <div key={p.id} style={{ ...styles.card, opacity: p.is_active ? 1 : 0.5 }}>
              {editingId === p.id ? (
                <PrizeForm
                  form={form}
                  setForm={setForm}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                  title="Modifier le lot"
                />
              ) : (
                <>
                  <div style={styles.cardTop}>
                    {p.image_url
                      ? <img src={p.image_url} alt={p.label} style={styles.prizeImg} />
                      : <div style={styles.prizeEmoji}>🏆</div>
                    }
                    <div style={styles.prizeInfo}>
                      <span style={{ ...styles.tierBadge, background: tierColors[p.tier] || '#94a3b8' }}>
                        {tierLabels[p.tier] || p.tier}
                      </span>
                      <div style={styles.prizeLabel}>{p.label}</div>
                      {p.description && <div style={styles.prizeDesc}>{p.description}</div>}
                      <div style={styles.prizeMeta}>
                        Quantité : <strong>{p.quantity}</strong>
                        &nbsp;·&nbsp;
                        <span style={{ color: p.is_active ? '#22C55E' : '#9ca3af' }}>
                          {p.is_active ? '● Actif' : '○ Inactif'}
                        </span>
                      </div>
                      {p.updated_at && (
                        <div style={styles.prizeUpdated}>
                          Modifié le {new Date(p.updated_at).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={styles.cardActions}>
                    <button style={styles.btnEdit} onClick={() => startEdit(p)}>✏️ Modifier</button>
                    <button style={styles.btnDelete} onClick={() => setConfirmDelete(p.id)}>🗑️ Supprimer</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div style={styles.modal}>
          <div style={styles.modalBox}>
            <p style={{ fontWeight: 700, marginBottom: 16 }}>Confirmer la suppression de ce lot ?</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={styles.btnConfirmDel} onClick={() => deletePrize(confirmDelete)}>Supprimer</button>
              <button style={styles.btnCancel} onClick={() => setConfirmDelete(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrizeForm({ form, setForm, onSave, onCancel, saving, title }) {
  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));
  return (
    <div style={formStyles.box}>
      <h3 style={formStyles.title}>{title}</h3>
      <div style={formStyles.grid}>
        <div style={formStyles.field}>
          <label style={formStyles.label}>Label *</label>
          <input style={formStyles.input} value={form.label} onChange={e => f('label', e.target.value)} />
        </div>
        <div style={formStyles.field}>
          <label style={formStyles.label}>Tier</label>
          <select style={formStyles.input} value={form.tier} onChange={e => f('tier', e.target.value)}>
            {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div style={formStyles.field}>
          <label style={formStyles.label}>Quantité</label>
          <input style={formStyles.input} type="number" min="0" value={form.quantity} onChange={e => f('quantity', parseInt(e.target.value))} />
        </div>
        <div style={formStyles.field}>
          <label style={formStyles.label}>Image URL</label>
          <input style={formStyles.input} value={form.image_url} onChange={e => f('image_url', e.target.value)} placeholder="https://..." />
        </div>
        <div style={{ ...formStyles.field, gridColumn: '1/-1' }}>
          <label style={formStyles.label}>Description</label>
          <input style={formStyles.input} value={form.description} onChange={e => f('description', e.target.value)} />
        </div>
        <div style={formStyles.field}>
          <label style={formStyles.label}>
            <input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} />
            &nbsp;Actif
          </label>
        </div>
      </div>
      <div style={formStyles.actions}>
        <button style={formStyles.btnSave} onClick={onSave} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        <button style={formStyles.btnCancel} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  toggleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'white', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24 },
  toggleTitle: { fontWeight: 800, fontSize: 15, color: '#00377D' },
  toggleHint: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  switch: { position: 'relative', width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', padding: 0 },
  switchKnob: { position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'transform 0.2s' },
  title: { fontFamily: "'Figtree', sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', color: '#00377D', letterSpacing: 2 },
  btnAdd: { padding: '10px 20px', borderRadius: 10, border: 'none', background: '#00377D', color: '#FFD100', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 },
  card: { background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  cardTop: { display: 'flex', gap: 14, marginBottom: 14 },
  prizeImg: { width: 72, height: 72, objectFit: 'contain', borderRadius: 10, flexShrink: 0 },
  prizeEmoji: { fontSize: 48, flexShrink: 0 },
  prizeInfo: { flex: 1 },
  tierBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#00377D', marginBottom: 4 },
  prizeLabel: { fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 2 },
  prizeDesc: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  prizeMeta: { fontSize: 13, color: '#374151' },
  prizeUpdated: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  cardActions: { display: 'flex', gap: 8 },
  btnEdit: { flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnDelete: { flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff5f5', color: '#EF4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalBox: { background: 'white', borderRadius: 16, padding: 28, maxWidth: 360, width: '90%' },
  btnConfirmDel: { flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#EF4444', color: 'white', fontWeight: 700, cursor: 'pointer' },
  btnCancel: { flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 600 },
};

const formStyles = {
  box: { background: '#f8faff', border: '2px solid #00377D', borderRadius: 16, padding: 20, marginBottom: 16 },
  title: { fontWeight: 800, fontSize: 16, color: '#00377D', marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 700, color: '#374151' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none' },
  actions: { display: 'flex', gap: 10, marginTop: 12 },
  btnSave: { padding: '10px 24px', borderRadius: 8, border: 'none', background: '#00377D', color: '#FFD100', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnCancel: { padding: '10px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 },
};
