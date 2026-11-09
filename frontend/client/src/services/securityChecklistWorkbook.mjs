/** Excel round-trip for checklist drafts. Parsing never assigns users or writes the server. */
import * as XLSX from 'xlsx';
import { inspectChecklistArchive } from './securityChecklistArchive.mjs';
const format = 'nist-security-checklist-v1';
const newId = (index) => 'import-' + index;
function validColumns(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > 30)
    throw Error('Excel harus memiliki 1–30 kolom.');
  const ids = new Set();
  for (const c of columns) {
    if (
      !c ||
      typeof c.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) ||
      ids.has(c.id) ||
      typeof c.label !== 'string' ||
      !c.label.trim() ||
      c.label.length > 100 ||
      !['text', 'select', 'evidence'].includes(c.type) ||
      !['definition', 'assessment'].includes(c.phase) ||
      !Array.isArray(c.options) ||
      c.options.length > 30 ||
      c.options.some((v) => typeof v !== 'string' || !v.trim() || v.length > 100) ||
      (c.type === 'select' && (!c.options.length || new Set(c.options).size !== c.options.length))
    )
      throw Error('Definisi kolom Excel tidak valid.');
    ids.add(c.id);
  }
  return columns;
}
function grid(book, name, maxRows, maxCols) {
  const sheet = book.Sheets[name];
  if (!sheet?.['!ref']) throw Error('Sheet ' + name + ' kosong.');
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
  if (range.e.r >= maxRows || range.e.c >= maxCols || range.s.r !== 0 || range.s.c !== 0)
    throw Error('Ukuran sheet ' + name + ' melebihi batas atau tidak dimulai di A1.');
  for (const [address, cell] of Object.entries(sheet))
    if (!address.startsWith('!') && (cell.f || cell.F))
      throw Error('Formula Excel tidak didukung. Ganti formula dengan nilai terlebih dahulu.');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
}
function validateRows(rows, columns) {
  if (!Array.isArray(rows) || rows.length > 500) throw Error('Maksimum 500 baris checklist.');
  for (const row of rows)
    for (const c of columns) {
      const value = row.values[c.id] ?? '';
      if (typeof value !== 'string' || value.length > 4000) throw Error('Maksimum 4000 karakter per sel.');
      if (value && c.type === 'select' && !c.options.includes(value))
        throw Error('Nilai pada kolom ' + c.label + ' tidak tersedia dalam pilihan.');
    }
}
export function writeChecklistWorkbook(draft) {
  const columns = validColumns(draft.columns);
  validateRows(draft.rows, columns);
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    columns.map((c) => c.label),
    ...draft.rows.map((r) => columns.map((c) => r.values[c.id] || '')),
  ]);
  sheet['!cols'] = columns.map(() => ({ wch: 28 }));
  XLSX.utils.book_append_sheet(book, sheet, 'Checklist');
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['format', format],
      ['title', draft.title || 'Checklist'],
      ...columns.map((c) => ['column', JSON.stringify(c)]),
    ]),
    '_Checklist',
  );
  book.Workbook = {
    Sheets: [
      { name: 'Checklist', Hidden: 0 },
      { name: '_Checklist', Hidden: 1 },
    ],
  };
  return XLSX.write(book, { type: 'array', bookType: 'xlsx', compression: true });
}
export function readChecklistWorkbook(buffer, defaults) {
  if (buffer.byteLength > 5 * 1024 * 1024) throw Error('Ukuran Excel maksimum 5 MB.');
  inspectChecklistArchive(buffer);
  let book;
  try {
    book = XLSX.read(buffer, { type: 'array', cellFormula: true, sheetRows: 502 });
  } catch {
    throw Error('File Excel tidak dapat dibaca. Gunakan format .xlsx.');
  }
  const name = book.SheetNames.includes('Checklist')
    ? 'Checklist'
    : book.SheetNames.find((n) => n !== '_Checklist');
  if (!name) throw Error('Sheet checklist tidak ditemukan.');
  const cells = grid(book, name, 501, 30);
  const headers = cells.shift().map((v) => String(v).trim());
  if (!headers.length || headers.some((v) => !v || v.length > 100))
    throw Error('Baris pertama wajib berisi nama setiap kolom (maksimum 100 karakter).');
  let columns,
    title = '';
  if (book.Sheets._Checklist) {
    const metaRows = grid(book, '_Checklist', 32, 2);
    const meta = Object.fromEntries(metaRows.slice(0, 2));
    if (meta.format !== format) throw Error('Format metadata checklist tidak dikenali.');
    try {
      columns = validColumns(
        metaRows.slice(2).map((row) => {
          if (row[0] !== 'column') throw Error('Invalid metadata');
          return JSON.parse(row[1]);
        }),
      );
    } catch {
      throw Error('Metadata kolom Excel tidak valid.');
    }
    if (columns.length !== headers.length || columns.some((c, i) => c.label.trim() !== headers[i]))
      throw Error(
        'Header berubah. Ekspor ulang setelah mengubah kolom di aplikasi, atau hapus sheet _Checklist untuk impor tabel biasa.',
      );
    title = String(meta.title || '').slice(0, 200);
  } else {
    if (new Set(headers.map((v) => v.toLowerCase())).size !== headers.length)
      throw Error('Nama kolom Excel duplikat.');
    columns = headers.map((label, i) => {
      const known = defaults.find((c) => c.label.toLowerCase() === label.toLowerCase());
      const c = known
        ? JSON.parse(JSON.stringify(known))
        : { id: 'column-' + i, label, type: 'text', phase: 'definition', options: [] };
      if (c.type === 'select')
        c.options = [
          ...new Set([...c.options, ...cells.map((r) => String(r[i] ?? '').trim()).filter(Boolean)]),
        ];
      return c;
    });
    validColumns(columns);
  }
  const rows = cells
    .filter((r) => r.some((v) => String(v).trim()))
    .map((r, i) => ({
      id: newId(i),
      values: Object.fromEntries(columns.map((c, j) => [c.id, String(r[j] ?? '').trim()])),
    }));
  validateRows(rows, columns);
  return { title, columns, rows };
}
