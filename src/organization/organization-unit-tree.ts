export function descendantOrganizationUnitIds(
  units: { id: string; parentId: string | null }[],
  rootId: string,
) {
  const children = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const list = children.get(unit.parentId) ?? [];
    list.push(unit.id);
    children.set(unit.parentId, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export function organizationUnitSubtreeIds(
  units: { id: string; parentId: string | null }[],
  rootId: string,
) {
  return [rootId, ...descendantOrganizationUnitIds(units, rootId)];
}

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
