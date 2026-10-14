import * as XLSX from 'xlsx';

const META = '_Progress';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbidden = key => ['__proto__', 'constructor', 'prototype'].includes(key);
function encode(value) {
  if (value === undefined) return undefined;
  const encoded = value === null || typeof value === 'object' ? '@json:' + JSON.stringify(value)
    : typeof value === 'string' && value.startsWith('@') ? '@text:' + value : value;
  if (typeof encoded === 'string' && encoded.length > 32767) throw Error('Isi sel melebihi batas Excel 32.767 karakter. Pisahkan data panjang atau gunakan Export JSON / backup file.');
  return encoded;
}
function decode(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('@text:')) return value.slice(6);
  if (value.startsWith('@json:')) return JSON.parse(value.slice(6));
  return value;
}
export function writeProgressWorkbook(payload, headers = {}) {
  if (!plain(payload?.data)) throw Error('Data progres tidak valid.');
  const book = XLSX.utils.book_new();
  const { data, ...envelope } = payload;
  const sections = [];
  for (const [key, value] of Object.entries(data)) {
    if (forbidden(key) || !/^[a-zA-Z0-9_-]{1,31}$/.test(key) || key === META) throw Error('Nama bagian Excel tidak valid.');
    const records = Array.isArray(value) ? value : [value];
    if (records.length > 5000 || records.some(row => !plain(row))) throw Error('Bagian Excel harus berisi object, maksimal 5.000 baris.');
    const columns = [...new Set([...Object.keys(headers[key] || {}), ...records.flatMap(row => Object.keys(row))])];
    if (!columns.length) columns.push('id');
    if (columns.some(forbidden)) throw Error('Header Excel tidak valid.');
    // Each section is editable; all fields are retained, including relationships and progress.
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...records.map(row => columns.map(column => encode(row[column])))]);
    sheet['!cols'] = columns.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(book, sheet, key);
    sections.push({ key, object: !Array.isArray(value), columns });
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['format', 'nist-basis-progress-excel'], ['version', 1],
    ['envelope', JSON.stringify(envelope)], ['sections', JSON.stringify(sections)],
    ['instructions', 'Edit sheet data. Pertahankan header, ID, dan sheet _Progress. Object/array memakai @json:. Sel kosong menghapus field. Formula tidak diterima. Berkas lampiran memakai referensi server.']
  ]), META);
  return XLSX.write(book, { type: 'array', bookType: 'xlsx', compression: true });
}
export function readProgressWorkbook(buffer, expectedModule) {
  if (buffer.byteLength > 10 * 1024 * 1024) throw Error('Ukuran file maksimal 10 MB.');
  const book = XLSX.read(buffer, { type: 'array', cellFormula: true, sheetRows: 5002 });
  const meta = book.Sheets[META];
  if (!meta || meta.B1?.v !== 'nist-basis-progress-excel' || meta.B2?.v !== 1) throw Error('Gunakan template atau hasil Export Excel progres dari aplikasi.');
  const envelope = JSON.parse(meta.B3?.v), sections = JSON.parse(meta.B4?.v);
  if (expectedModule && envelope.module !== expectedModule) throw Error('File Excel berasal dari modul lain.');
  if (!Array.isArray(sections) || sections.length > 30 || new Set(sections.map(part => part.key)).size !== sections.length) throw Error('Struktur Excel tidak valid.');
  const data = {};
  for (const part of sections) {
    if (!plain(part) || forbidden(part.key) || !Array.isArray(part.columns) || part.columns.some(forbidden)) throw Error('Struktur bagian Excel tidak valid.');
    const sheet = book.Sheets[part.key];
    if (!sheet || !sheet['!ref']) throw Error(`Sheet ${part.key} wajib tersedia.`);
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if (range.e.r > 5000 || range.e.c > 250) throw Error('Excel maksimal 5.000 baris dan 251 kolom per bagian.');
    for (const [address, cell] of Object.entries(sheet)) if (!address.startsWith('!') && (cell.f || cell.t === 'e')) throw Error('Formula dan sel error tidak diterima pada data progres.');
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
    const columns = grid.shift() || [];
    if (JSON.stringify(columns) !== JSON.stringify(part.columns)) throw Error(`Header sheet ${part.key} berubah. Gunakan template Excel modul ini.`);
    const records = grid.map(values => Object.fromEntries(columns.flatMap((key, index) => values[index] === undefined ? [] : [[key, decode(values[index])]])));
    if (part.object && records.length !== 1) throw Error(`Sheet ${part.key} harus berisi satu baris.`);
    data[part.key] = part.object ? records[0] : records;
  }
  return { ...envelope, data };
}
