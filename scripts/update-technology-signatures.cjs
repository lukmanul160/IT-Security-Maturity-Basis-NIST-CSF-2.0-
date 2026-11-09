/** Fetch an immutable community Wappalyzer-format data snapshot, never target-site content. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const revision = 'c708f0b2894cee70bb3b2eddde37dcb05595800c';
const repository = 'enthec/webappanalyzer';
const root = path.resolve(__dirname, '../third_party/webappanalyzer');
async function run() {
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository}/git/trees/${revision}?recursive=1`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!treeResponse.ok) throw Error('Signature source tree unavailable');
  const tree = await treeResponse.json();
  const files = [
    'LICENSE',
    'README.md',
    'src/categories.json',
    ...tree.tree
      .filter((file) => /^src\/technologies\/[a-z_]\.json$/.test(file.path))
      .map((file) => file.path),
  ];
  const hashes = {};
  for (let offset = 0; offset < files.length; offset += 6) {
    const results = await Promise.allSettled(
      files.slice(offset, offset + 6).map(async (file) => {
        const response = await fetch(`https://raw.githubusercontent.com/${repository}/${revision}/${file}`, {
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw Error(`Signature download failed: ${file}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 4 * 1024 * 1024) throw Error('Signature source exceeded limit');
        const destination = path.join(root, file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, buffer);
        hashes[file] = crypto.createHash('sha256').update(buffer).digest('hex');
      }),
    );
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  await fs.writeFile(
    path.join(root, 'SOURCE.json'),
    JSON.stringify({ repository, revision, license: 'GPL-3.0', files: hashes }, null, 2) + '\n',
  );
  console.log(
    `Pinned ${files.length} upstream source files at ${revision}; GPL license and attribution retained.`,
  );
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
