export function buildOrganizationUnitPaths(
  units: { id: string; name: string; parentId: string | null }[],
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const paths = new Map<string, string>();
  const visiting = new Set<string>();

  function pathOf(id: string): string {
    const cached = paths.get(id);
    if (cached) return cached;
    const unit = byId.get(id);
    if (!unit) return '';
    if (visiting.has(id)) return unit.name;
    visiting.add(id);
    const parentPath = unit.parentId ? pathOf(unit.parentId) : '';
    visiting.delete(id);
    const next = parentPath ? `${parentPath} / ${unit.name}` : unit.name;
    paths.set(id, next);
    return next;
  }

  for (const unit of units) {
    pathOf(unit.id);
  }
  return paths;
}
