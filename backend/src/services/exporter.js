// Exports CSV (UTF-8 avec BOM, séparateur « ; » pour Excel FR) et Excel (.xlsx).
const ExcelJS = require('exceljs');

function cell(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function toCsv(columns, rows) {
  const esc = (v) => {
    const s = String(cell(v));
    // neutralise les formules (injection CSV)
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map(c => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map(c => esc(c.value ? c.value(r) : r[c.key])).join(';'));
  return `﻿${lines.join('\r\n')}`;
}

async function toXlsx(columns, rows, sheetName = 'Export') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Défi Yas — back-office';
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map(c => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 2) }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FF00377D' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD100' } };
  for (const r of rows) {
    const obj = {};
    for (const c of columns) {
      const v = c.value ? c.value(r) : r[c.key];
      obj[c.key] = v instanceof Date || typeof v === 'number' ? v : cell(v);
    }
    ws.addRow(obj);
  }
  return wb.xlsx.writeBuffer();
}

async function send(res, format, filename, columns, rows) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'xlsx') {
    const buf = await toXlsx(columns, rows, filename);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${filename}_${stamp}.xlsx"`);
    return res.send(Buffer.from(buf));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}_${stamp}.csv"`);
  return res.send(toCsv(columns, rows));
}

module.exports = { send, toCsv, toXlsx };
