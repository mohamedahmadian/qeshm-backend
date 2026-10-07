const PUBLIC_ROUTES: { method?: string; prefix: string }[] = [
  { method: 'POST', prefix: '/auth/login' },
  { method: 'POST', prefix: '/auth/forgot-password' },
  { method: 'POST', prefix: '/cooperative/auth/token' },
  { prefix: '/cooperative/qeshmondi/sync' },
  { prefix: '/public/profiles' },
  { prefix: '/public/projects' },
  { prefix: '/public/singard' },
  { method: 'GET', prefix: '/images' },
  { method: 'GET', prefix: '/files' },
];

const AUTH_ONLY_PREFIXES = [
  '/auth',
  '/account',
  '/images',
  '/files',
  '/board',
];

const LOOKUP_COLLECTIONS = new Set([
  '/countries',
  '/provinces',
  '/cities',
  '/roles',
  '/users',
  '/organization/positions',
  '/organization/unit-kinds',
  '/organization/units',
  '/vehicle-brands',
  '/vehicles',
  '/foods',
  '/restaurants',
  '/projects',
  '/projects/lookups',
  '/projects/groups',
  '/singard/categories',
]);

type RoutePermission = {
  prefix: string;
  method?: string;
  permissions: string[];
};

const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: '/roles', permissions: ['management.roles'] },
  { prefix: '/countries', permissions: ['base-info.countries'] },
  { prefix: '/provinces', permissions: ['base-info.provinces'] },
  { prefix: '/cities', permissions: ['base-info.cities'] },
  {
    prefix: '/users/qeshmondi-sql-connection',
    permissions: ['qeshmondi.update'],
  },
  { prefix: '/users/qeshmondi-sync-logs', permissions: ['qeshmondi.sync-logs'] },
  { prefix: '/users/qeshmondi-sync', permissions: ['qeshmondi.update'] },
  { prefix: '/users/qeshmondi-import', permissions: ['qeshmondi.update'] },
  { prefix: '/users/qeshmondi-inquiry', permissions: ['qeshmondi.inquiry'] },
  { prefix: '/users/qeshmondi-traffic', permissions: ['qeshmondi.inquiry'] },
  { prefix: '/users/qeshmondi-bank', permissions: ['qeshmondi.inquiry'] },
  { prefix: '/users/qeshmondi-analytics', permissions: ['qeshmondi.analytics'] },
  { prefix: '/users/qeshmondi-imports', permissions: ['qeshmondi.update'] },
  {
    prefix: '/users',
    permissions: [
      'management.users',
      'qeshm-organization.employees',
      'qeshmondi.citizens',
      'qeshmondi.update',
    ],
  },
  { prefix: '/projects/reports', permissions: ['projects.reports'] },
  { prefix: '/projects/live-board', permissions: ['projects.liveBoard'] },
  { prefix: '/projects/groups', permissions: ['projects.groups'] },
  { prefix: '/contractors', permissions: ['projects.contractors'] },
  { prefix: '/projects', permissions: ['projects.list'] },
  { prefix: '/foods', permissions: ['food-reservation.foods'] },
  {
    prefix: '/food-reservation/unit-reps',
    permissions: ['food-reservation.unit-reps'],
  },
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
    prefix: '/food-reservations/unit-report',
    permissions: ['food-reservation.unit-report'],
  },
  {
    prefix: '/food-reservations/context',
    permissions: ['food-reservation.reserve'],
  },
  {
    prefix: '/food-reservations/mine/summary',
    permissions: ['food-reservation.my-report'],
  },
  {
    method: 'POST',
    prefix: '/food-reservations',
    permissions: ['food-reservation.reserve'],
  },
  {
    method: 'PATCH',
    prefix: '/food-reservations',
    permissions: [
      'food-reservation.history',
      'food-reservation.report',
      'food-reservation.cost-estimate',
    ],
  },
  {
    prefix: '/food-reservations',
    permissions: [
      'food-reservation.reserve',
      'food-reservation.my-orders',
      'food-reservation.my-report',
      'food-reservation.history',
      'food-reservation.report',
      'food-reservation.cost-estimate',
    ],
  },
  {
    prefix: '/organization/positions',
    permissions: ['qeshm-organization.positions'],
  },
  {
    prefix: '/organization/unit-kinds',
    permissions: ['qeshm-organization.unit-kinds'],
  },
  {
    prefix: '/organization/units',
    permissions: ['qeshm-organization.units'],
  },
  {
    prefix: '/organization/employees',
    permissions: ['qeshm-organization.employees'],
  },
  { prefix: '/organization', permissions: ['qeshm-organization.info'] },
  { prefix: '/vehicle-brands', permissions: ['light-assets.vehicle-brands'] },
  { prefix: '/vehicles/reports', permissions: ['light-assets.vehicle-reports'] },
  { prefix: '/vehicles', permissions: ['light-assets.vehicles'] },
  { method: 'POST', prefix: '/singard/mine', permissions: ['singard.submit'] },
  { prefix: '/singard/mine', permissions: ['singard.mine'] },
  { prefix: '/singard/reports', permissions: ['singard.reports'] },
  { prefix: '/singard/categories', permissions: ['singard.categories'] },
  { prefix: '/singard/feedbacks', permissions: ['singard.inbox'] },
  {
    prefix: '/port-sales-reports/mine/subsidies',
    permissions: ['stakeholders.my-subsidies'],
  },
  { prefix: '/port-sales-reports', permissions: ['stakeholders.port-sales-reports'] },
  { prefix: '/ticket-tariffs', permissions: ['stakeholders.ticket-tariffs'] },
  {
    prefix: '/ports',
    permissions: ['stakeholders.ports', 'stakeholders.port-sales-reports'],
  },
  {
    prefix: '/stakeholders/contractors',
    permissions: ['management.users', 'stakeholders.inbox', 'stakeholders.reports'],
  },
  { prefix: '/stakeholders/projects', permissions: ['stakeholders.projects'] },
  {
    prefix: '/stakeholders/progress',
    permissions: ['stakeholders.progress'],
  },
  {
    prefix: '/stakeholders/reports',
    permissions: ['stakeholders.reports'],
  },
  {
    prefix: '/stakeholders/correspondence',
    permissions: ['stakeholders.correspondence'],
  },
  { prefix: '/stakeholders/inbox', permissions: ['stakeholders.inbox'] },
  { prefix: '/dashboard/stats/projects', permissions: ['projects.list'] },
  { prefix: '/dashboard/stats/contractors', permissions: ['projects.contractors'] },
  { prefix: '/dashboard/stats/resolutions', permissions: ['board.resolutions'] },
  { prefix: '/dashboard/stats/qeshmondi', permissions: ['qeshmondi.citizens'] },
  { prefix: '/dashboard/recent-reports', permissions: ['stakeholders.reports'] },
  { prefix: '/dashboard/important-projects', permissions: ['projects.list'] },
].sort((a, b) => b.prefix.length - a.prefix.length);

export type AccessDecision =
  | { kind: 'public' }
  | { kind: 'auth' }
  | { kind: 'permission'; permissions: string[] };

export function isSingardApiPath(rawPath: string) {
  const path = normalizeApiPath(rawPath);
  return path === '/singard' || path.startsWith('/singard/');
}

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

function organizationUnitScopePermissions(path: string, method: string) {
  const restaurant =
    /^\/organization\/units\/[^/]+\/restaurants(?:\/[^/]+)?$/.test(path);
  const unitRead = method === 'GET' && /^\/organization\/units\/[^/]+$/.test(path);
  if (!restaurant && !unitRead) return null;
  return ['qeshm-organization.units', 'food-reservation.unit-reps'];
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

  const unitScope = organizationUnitScopePermissions(path, verb);
  if (unitScope) {
    return { kind: 'permission', permissions: unitScope };
  }

  const mapped = ROUTE_PERMISSIONS.find(
    (route) =>
      matchesPrefix(path, route.prefix) &&
      (!route.method || route.method === verb),
  );
  if (mapped) {
    return { kind: 'permission', permissions: mapped.permissions };
  }

  return { kind: 'auth' };
}
