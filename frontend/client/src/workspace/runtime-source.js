/**
 * Rakit teks classic-script sesuai manifest tanpa mengeksekusinya. Glob Vite
 * menyediakan sumber lokal; aturan domain dan listener tetap di features/.
 */
export function assembleWorkspaceSource(parts, shared, plan) {
  const prefix = 'frontend/client/src/workspace/';
  const seen = new Set();
  return plan.map(part => {
    if (seen.has(part.path)) throw new Error(`Duplicate workspace source: ${part.path}`);
    seen.add(part.path);
    const source = part.path.startsWith(prefix)
      ? parts['./' + part.path.slice(prefix.length)]
      : shared[part.path];
    if (typeof source !== 'string') throw new Error(`Missing workspace source: ${part.path}`);
    return source;
  }).join('');
}
