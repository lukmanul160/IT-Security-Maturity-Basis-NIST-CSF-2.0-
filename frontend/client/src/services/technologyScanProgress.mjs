/** Read real scanner stage events; normal JSON responses remain compatible with older servers. */
export async function requestTechnologyScan(url, mode, onProgress) {
  const response = await fetch('/api/technology-assets/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ url, mode }),
  });
  if (!response.ok) {
    const body = await response.json();
    throw Error(body.error || 'Permintaan gagal.');
  }
  if (!response.headers?.get?.('content-type')?.includes('application/x-ndjson')) return response.json();
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    result;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'progress' && Number.isFinite(event.percent))
      onProgress({ percent: Math.min(100, Math.max(0, event.percent)), stage: event.stage });
    if (event.type === 'error') throw Error(event.error || 'Permintaan gagal.');
    if (event.type === 'result') result = event.result;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2 * 1024 * 1024) throw Error('Respons scan tidak valid atau terputus.');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) consume(line);
      if (done) {
        consume(buffer);
        break;
      }
    }
    if (!result) throw Error('Respons scan tidak valid atau terputus.');
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
