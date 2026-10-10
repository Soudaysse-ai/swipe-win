// Composants partagés du back-office.
import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from 'recharts';
import { downloadExport, adminError } from '../utils/api';
import { useAdminAuth } from '../hooks/useAdminAuth';

// Palette catégorielle validée (contrôle CVD) — la couleur suit le jeu, jamais son rang.
export const GAME_COLORS = { cards: '#B88E00', connect: '#2a78d6', penalty: '#e87ba4', ludo: '#1baf7a' };
export const GAME_NAMES = { cards: 'Yas Cards', connect: 'Yas Connect', penalty: 'Yas Penalty', ludo: 'Yas Ludo' };
export const SERIES = '#00377D';

export const fmt = {
  n: (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR')),
  pct: (v) => (v == null ? '—' : `${(Number(v) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`),
  dur: (ms) => {
    if (ms == null) return '—';
    const m = Math.round(Number(ms) / 60000);
    if (m < 1) return `${Math.round(Number(ms) / 1000)} s`;
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  },
  date: (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—'),
  dt: (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'),
  day: (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
};

export function Head({ title, sub, children }) {
  return (
    <div className="adm-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="row wrap" style={{ gap: 8 }}>{children}</div>
    </div>
  );
}

export function Kpi({ label, value, change, hint }) {
  const up = change != null && change > 0;
  const down = change != null && change < 0;
  return (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {change != null && (
        <div className="d" style={{ color: up ? '#1E7A42' : down ? '#B42A28' : 'var(--yas-neutral-70)' }}>
          {up ? '▲' : down ? '▼' : '='} {Math.abs(change).toLocaleString('fr-FR')} % vs période précédente
        </div>
      )}
      {hint && <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const iso = (d) => d.toISOString().slice(0, 10);
export function defaultRange(days = 30) {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  return { from: iso(from), to: iso(to) };
}

export function DateRange({ value, onChange }) {
  const presets = [[7, '7 j'], [30, '30 j'], [90, '90 j']];
  return (
    <div className="row" style={{ gap: 6 }}>
      {presets.map(([d, l]) => (
        <button key={d} className="tab" style={{ height: 36 }} onClick={() => onChange(defaultRange(d))}>{l}</button>
      ))}
      <input type="date" className="adm-input" value={value.from} max={value.to} onChange={e => onChange({ ...value, from: e.target.value })} aria-label="Du" />
      <span className="small">→</span>
      <input type="date" className="adm-input" value={value.to} min={value.from} onChange={e => onChange({ ...value, to: e.target.value })} aria-label="Au" />
    </div>
  );
}

export function GameSelect({ value, onChange, allLabel = 'Tous les jeux' }) {
  return (
    <select className="adm-input" value={value || ''} onChange={e => onChange(e.target.value || null)} aria-label="Jeu">
      <option value="">{allLabel}</option>
      {Object.entries(GAME_NAMES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
    </select>
  );
}

export function ExportButtons({ path, params }) {
  const { can } = useAdminAuth();
  const [busy, setBusy] = useState(null);
  if (!can('exports')) return null;
  async function go(format) {
    setBusy(format);
    try { await downloadExport(path, params, format); } catch (err) { alert(adminError(err)); } finally { setBusy(null); }
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn sm outline" disabled={!!busy} onClick={() => go('csv')}>{busy === 'csv' ? '…' : 'Export CSV'}</button>
      <button className="btn sm outline" disabled={!!busy} onClick={() => go('xlsx')}>{busy === 'xlsx' ? '…' : 'Export Excel'}</button>
    </div>
  );
}

// Tableau : colonnes { key, label, num?, render?, sortKey? }
export function DataTable({ columns, rows, sort, onSort, empty = 'Aucune donnée sur cette période.', onRowClick }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map(c => (
            <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort?.key === (c.sortKey || c.key) ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              {onSort && c.sortKey !== false ? (
                <button onClick={() => onSort(c.sortKey || c.key)}>{c.label}{sort?.key === (c.sortKey || c.key) ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
              ) : c.label}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={columns.length} className="center muted" style={{ padding: 24 }}>{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id || r.user_id || r.userId || i} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ cursor: onRowClick ? 'pointer' : undefined }}>
              {columns.map(c => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>{fmt.n(total)} résultat(s)</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
        <span>Page {page} / {pages}</span>
        <button className="btn sm outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button>
      </div>
    </div>
  );
}

function Tip({ active, payload, label, unit = '', labelFmt = fmt.day }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tiny muted">{labelFmt(label)}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="row" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 2, background: p.color || p.payload?.fill, display: 'inline-block' }} />
          <b>{fmt.n(p.value)}{unit}</b><span className="tiny muted">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// Série temporelle (une seule série par graphique : jamais de double axe).
export function TimeSeries({ title, data, dataKey, name, color = SERIES, height = 220 }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#E7E7E8" vertical={false} />
            <XAxis dataKey="day" tickFormatter={fmt.day} tick={{ fontSize: 12, fill: '#575758' }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#575758' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<Tip />} cursor={{ stroke: '#A6B9D2', strokeWidth: 1 }} />
            <Line type="linear" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Barres catégorielles avec libellés directs (valeur au bout de la barre).
export function CategoryBars({ title, data, valueKey, labelKey, colorOf = () => SERIES, height = 220, unit = '' }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 22, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke="#E7E7E8" vertical={false} />
            <XAxis dataKey={labelKey} tick={{ fontSize: 12, fill: '#00377D' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#575758' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<Tip labelFmt={(l) => l} unit={unit} />} cursor={{ fill: 'rgba(0,55,125,.06)' }} />
            <Bar dataKey={valueKey} name={title} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={2}>
              {data.map((d, i) => <Cell key={i} fill={colorOf(d)} />)}
              <LabelList dataKey={valueKey} position="top" style={{ fontSize: 12, fill: '#00377D', fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StatusDot({ status }) {
  const map = { active: ['#3CB167', 'Actif'], suspended: ['#FFA602', 'Suspendu'], banned: ['#FF6462', 'Banni'], deleted: ['#9F9F9F', 'Supprimé'] };
  const [c, l] = map[status] || ['#9F9F9F', status];
  return <span className="status"><i style={{ background: c }} />{l}</span>;
}

export function useRange(days = 30) {
  return useState(defaultRange(days));
}

export function Loading() {
  return <div className="page-loading"><div className="spinner" /></div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error" role="alert">{error}</div>;
}
