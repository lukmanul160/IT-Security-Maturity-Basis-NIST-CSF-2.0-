/** User-defined inventory rules. Numeric dotted versions are not product lifecycle or CVE assertions. */
export function compareNumericVersions(left, right) {
  const valid = (value) =>
    typeof value === 'string' && value.length <= 100 && /^\d+(?:\.\d+){0,19}$/.test(value);
  if (!valid(left) || !valid(right)) return null;
  const a = left.split('.').map(BigInt),
    b = right.split('.').map(BigInt);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const first = a[index] ?? 0n,
      second = b[index] ?? 0n;
    if (first !== second) return first < second ? -1 : 1;
  }
  return 0;
}
export function matchesTechnology(technology, rule) {
  if (technology.name.trim().toLowerCase() !== rule.name.trim().toLowerCase()) return false;
  if (!rule.version) return true;
  if (rule.operator === 'contains')
    return technology.version.toLowerCase().includes(rule.version.toLowerCase());
  const comparison = compareNumericVersions(technology.version, rule.version);
  if (comparison === null)
    return rule.operator === '=' && technology.version.toLowerCase() === rule.version.toLowerCase();
  return (
    {
      '=': comparison === 0,
      '<': comparison < 0,
      '<=': comparison <= 0,
      '>': comparison > 0,
      '>=': comparison >= 0,
    }[rule.operator] === true
  );
}
export function searchTechnologyAssets(records, rules, mode = 'AND') {
  if (!rules.length || !['AND', 'OR'].includes(mode)) return [];
  return records.flatMap((record) => {
    const matches = rules.map((rule) =>
      record.data.technologies.filter((technology) => matchesTechnology(technology, rule)),
    );
    if (!(mode === 'AND' ? matches.every((group) => group.length) : matches.some((group) => group.length)))
      return [];
    return [
      {
        record,
        technologies: [
          ...new Map(
            matches
              .flat()
              .map((technology) => [
                JSON.stringify([technology.name, technology.version, technology.quadrant]),
                technology,
              ]),
          ).values(),
        ],
      },
    ];
  });
}
