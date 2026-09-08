export const sortDirections = ['asc', 'desc'] as const;
export type SortDirection = (typeof sortDirections)[number];

/**
 * Build Prisma orderBy: primary sort (if valid) then stable fallbacks.
 * Pass an explicit type argument, e.g.
 * resolveSortOrder<Prisma.UserOrderByWithRelationInput>(...)
 *
 * A builder may return one clause or several (e.g. date + time tie-break).
 */
export function resolveSortOrder<TOrderBy>(
  sortBy: string | undefined,
  sortDir: SortDirection | undefined,
  builders: Record<string, (dir: SortDirection) => TOrderBy | TOrderBy[]>,
  fallback: NoInfer<TOrderBy>[],
): TOrderBy[] {
  if (!sortBy || (sortDir !== 'asc' && sortDir !== 'desc')) {
    return fallback;
  }
  const build = builders[sortBy];
  if (!build) {
    return fallback;
  }
  const primary = build(sortDir);
  return [...(Array.isArray(primary) ? primary : [primary]), ...fallback];
}
