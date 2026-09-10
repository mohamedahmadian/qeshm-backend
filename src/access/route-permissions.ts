const PUBLIC_ROUTES: { method?: string; prefix: string }[] = [
  { method: 'POST', prefix: '/auth/login' },
  { method: 'POST', prefix: '/auth/forgot-password' },
  { prefix: '/public/profiles' },
  { method: 'GET', prefix: '/images' },
];

const AUTH_ONLY_PREFIXES = [
  '/auth',
  '/account',
  '/images',
  '/files',
];

const LOOKUP_COLLECTIONS = new Set([
  '/countries',
  '/provinces',
  '/cities',
  '/roles',
  '/users',
  '/organization/positions',
  '/organization/units',
  '/vehicle-brands',
  '/vehicles',
  '/foods',
  '/restaurants',
  '/projects',
  '/projects/lookups',
]);

type RoutePermission = {
  prefix: string;
  permissions: string[];
};

const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: '/roles', permissions: ['management.roles'] },
  { prefix: '/countries', permissions: ['base-info.countries'] },
  { prefix: '/provinces', permissions: ['base-info.provinces'] },
  { prefix: '/cities', permissions: ['base-info.cities'] },
  {
    prefix: '/users',
    permissions: ['management.users', 'qeshm-organization.employees'],
  },
  { prefix: '/projects/reports', permissions: ['projects.reports'] },
  { prefix: '/projects/live-board', permissions: ['projects.liveBoard'] },
  { prefix: '/projects', permissions: ['projects.list'] },
  { prefix: '/foods', permissions: ['food-reservation.foods'] },
  { prefix: '/restaurants', permissions: ['food-reservation.restaurants'] },
  {
    prefix: '/food-reservations/report',
    permissions: ['food-reservation.report'],
  },
  {
    prefix: '/food-reservations/cost-estimate',
    permissions: ['food-reservation.cost-estimate'],
  },
  {
    prefix: '/food-reservations/context',
    permissions: ['food-reservation.reserve'],
  },
  {
    prefix: '/food-reservations',
    permissions: [
      'food-reservation.reserve',
      'food-reservation.history',
      'food-reservation.report',
      'food-reservation.cost-estimate',
    ],
  },
  {
    prefix: '/organization/positions',
    permissions: ['qeshm-organization.positions'],
  },
  { prefix: '/organization/units', permissions: ['qeshm-organization.units'] },
  {
    prefix: '/organization/employees',
    permissions: ['qeshm-organization.employees'],
  },
  { prefix: '/organization', permissions: ['qeshm-organization.info'] },
  { prefix: '/vehicle-brands', permissions: ['light-assets.vehicle-brands'] },
  { prefix: '/vehicles/reports', permissions: ['light-assets.vehicle-reports'] },
  { prefix: '/vehicles', permissions: ['light-assets.vehicles'] },
].sort((a, b) => b.prefix.length - a.prefix.length);

export type AccessDecision =
  | { kind: 'public' }
  | { kind: 'auth' }
  | { kind: 'permission'; permissions: string[] };

function normalizeApiPath(rawPath: string) {
  const withoutQuery = rawPath.split('?')[0] ?? '';
  const path = withoutQuery.startsWith('/api/')
    ? withoutQuery.slice(4)
    : withoutQuery === '/api'
      ? '/'
      : withoutQuery;
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function resolveAccessDecision(
  method: string,
  rawPath: string,
  query: Record<string, unknown> = {},
): AccessDecision {
  const path = normalizeApiPath(rawPath);
  const verb = method.toUpperCase();

  if (
    PUBLIC_ROUTES.some(
      (route) =>
        matchesPrefix(path, route.prefix) &&
        (!route.method || route.method === verb),
    )
  ) {
    return { kind: 'public' };
  }

  if (AUTH_ONLY_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) {
    return { kind: 'auth' };
  }

  if (
    verb === 'GET' &&
    query.page == null &&
    LOOKUP_COLLECTIONS.has(path)
  ) {
    return { kind: 'auth' };
  }

  const mapped = ROUTE_PERMISSIONS.find((route) =>
    matchesPrefix(path, route.prefix),
  );
  if (mapped) {
    return { kind: 'permission', permissions: mapped.permissions };
  }

  return { kind: 'auth' };
}
