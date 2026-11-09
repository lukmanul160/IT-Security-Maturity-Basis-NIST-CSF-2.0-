/** Shared technology/version identity for dashboard, radar and bipartite application graph. */
export const rings = ['adopt', 'trial', 'assess', 'hold'];
export const quadrants = ['framework', 'platform', 'data', 'tool'];
export function technologyKey(technology) {
  return JSON.stringify([
    technology.name.trim().toLowerCase(),
    technology.version.trim().toLowerCase(),
    technology.quadrant,
  ]);
}
export function technologyMap(records) {
  const nodes = new Map();
  for (const app of records)
    for (const technology of app.data.technologies) {
      const key = technologyKey(technology);
      if (!nodes.has(key)) nodes.set(key, { ...technology, key, applications: [], rings: [] });
      const node = nodes.get(key);
      if (!node.applications.some((item) => item.id === app.id))
        node.applications.push({ id: app.id, name: app.data.name });
      if (!node.rings.includes(technology.ring)) node.rings.push(technology.ring);
      // A shared technology with conflicting decisions uses the most cautious recorded ring.
      node.ring = rings[Math.max(...node.rings.map((ring) => rings.indexOf(ring)))];
    }
  return [...nodes.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }),
  );
}
export function versionComparison(nodes) {
  const names = new Map();
  for (const node of nodes) {
    const key = node.name.toLowerCase();
    if (!names.has(key)) names.set(key, { name: node.name, versions: new Map() });
    const group = names.get(key),
      version = node.version || '';
    if (!group.versions.has(version)) group.versions.set(version, { version, applications: [] });
    const row = group.versions.get(version);
    for (const app of node.applications)
      if (!row.applications.some((item) => item.id === app.id)) row.applications.push(app);
  }
  return [...names.values()].map((group) => ({
    name: group.name,
    versions: [...group.versions.values()],
    different: group.versions.size > 1,
  }));
}
export function radarPoints(nodes) {
  const groups = new Map(),
    positions = new Map();
  for (const node of nodes) {
    const group = node.quadrant + ':' + node.ring;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  }
  for (const peers of groups.values())
    peers.forEach((node, index) => {
      const quadrant = quadrants.indexOf(node.quadrant),
        ring = rings.indexOf(node.ring);
      const angle = -Math.PI + (quadrant * Math.PI) / 2 + (((index + 1) / (peers.length + 1)) * Math.PI) / 2;
      const radius = 36 + ring * 66 + (index % 3) * 13;
      positions.set(node.key, { x: 330 + Math.cos(angle) * radius, y: 330 + Math.sin(angle) * radius });
    });
  return nodes.map((node) => ({ ...node, ...positions.get(node.key) }));
}
