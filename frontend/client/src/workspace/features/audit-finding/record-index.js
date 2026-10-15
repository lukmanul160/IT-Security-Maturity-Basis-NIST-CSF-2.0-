// Pure snapshot index. Keep API ordering and record object references intact.
function createAuditRecordIndex(records) {
  const byId = new Map();
  const byParent = new Map();
  for (const record of records) {
    // Preserve Array.find behavior if malformed data contains duplicate IDs.
    if (!byId.has(record.id)) byId.set(record.id, record);
    if (!byParent.has(record.parentId)) byParent.set(record.parentId, []);
    byParent.get(record.parentId).push(record);
  }

  function ancestors(record) {
    const chain = [];
    const visited = new Set([record.id]);
    let parent = byId.get(record.parentId);
    while (parent && !visited.has(parent.id)) {
      chain.push(parent);
      visited.add(parent.id);
      parent = byId.get(parent.parentId);
    }
    return chain.reverse();
  }

  return {
    get: id => byId.get(id),
    children: parentId => byParent.get(parentId) || [],
    ancestors
  };
}
