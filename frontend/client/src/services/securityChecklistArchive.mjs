/** Bound both declared and actual ZIP expansion before SheetJS parses a checklist. */
const MAX_INPUT = 5 * 1024 * 1024;
const MAX_EXPANDED = 25 * 1024 * 1024;
const invalid = () => Error('Arsip Excel tidak valid atau melebihi batas dekompresi 25 MB.');

export function inspectChecklistArchive(buffer) {
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  if (bytes.byteLength > MAX_INPUT) throw Error('Ukuran Excel maksimum 5 MB.');
  if (bytes.length < 22) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break;
  }
  if (end < Math.max(0, bytes.length - 65557)) throw invalid();
  const count = view.getUint16(end + 10, true),
    directorySize = view.getUint32(end + 12, true),
    directoryOffset = view.getUint32(end + 16, true);
  if (
    !count ||
    count > 256 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true) ||
    directoryOffset + directorySize !== end
  )
    throw invalid();
  let cursor = directoryOffset,
    expanded = 0;
  const entries = [],
    names = new Set();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true),
      next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      local + 30 > directoryOffset ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true) ||
      expanded + size > MAX_EXPANDED
    )
      throw invalid();
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (
      !name ||
      names.has(name) ||
      /(^|[\/\\])(?:\.\.|__proto__|constructor|prototype)(?:[\/\\]|$)/.test(name) ||
      /[\x00-\x1f]/.test(name) ||
      name.startsWith('/') ||
      name.includes('\\')
    )
      throw invalid();
    names.add(name);
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint16(local + 6, true) !== flags
    )
      throw invalid();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > directoryOffset || (method === 0 && size !== compressed)) throw invalid();
    entries.push({ method, size, data: bytes.subarray(start, start + compressed) });
    expanded += size;
    cursor = next;
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw invalid();
  return entries;
}

export async function verifyChecklistArchive(buffer) {
  const entries = inspectChecklistArchive(buffer);
  let expanded = 0;
  for (const entry of entries) {
    if (entry.method === 0) {
      expanded += entry.size;
      continue;
    }
    const reader = new Blob([entry.data])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader();
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        expanded += chunk.value.byteLength;
        if (size > entry.size || expanded > MAX_EXPANDED) throw invalid();
      }
      if (size !== entry.size) throw invalid();
    } catch {
      await reader.cancel().catch(() => {});
      throw invalid();
    } finally {
      reader.releaseLock();
    }
  }
}
