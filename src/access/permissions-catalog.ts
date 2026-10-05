export type PermissionKind = 'MODULE' | 'MENU';

export type PermissionNode = {
  code: string;
  kind: PermissionKind;
  nameKey: string;
  children?: PermissionNode[];
};

export const PERMISSION_TREE: PermissionNode[] = [
  {
    code: 'dashboard',
    kind: 'MODULE',
    nameKey: 'modules.dashboard',
    children: [
      { code: 'dashboard.home', kind: 'MENU', nameKey: 'menus.overview' },
    ],
  },
  {
    code: 'singard',
    kind: 'MODULE',
    nameKey: 'modules.singard',
    children: [
      { code: 'singard.submit', kind: 'MENU', nameKey: 'menus.singardSubmit' },
      { code: 'singard.mine', kind: 'MENU', nameKey: 'menus.singardMine' },
      { code: 'singard.inbox', kind: 'MENU', nameKey: 'menus.singardInbox' },
      { code: 'singard.categories', kind: 'MENU', nameKey: 'menus.singardCategories' },
      { code: 'singard.reports', kind: 'MENU', nameKey: 'menus.singardReports' },
    ],
  },
  {
    code: 'projects',
    kind: 'MODULE',
    nameKey: 'modules.projects',
    children: [
      { code: 'projects.list', kind: 'MENU', nameKey: 'menus.projects' },
      { code: 'projects.groups', kind: 'MENU', nameKey: 'menus.projectGroups' },
      { code: 'projects.calendar', kind: 'MENU', nameKey: 'menus.projectCalendar' },
      {
        code: 'projects.liveBoard',
        kind: 'MENU',
        nameKey: 'menus.digitalTransformationLiveBoard',
      },
      { code: 'projects.reports', kind: 'MENU', nameKey: 'menus.projectReports' },
      {
        code: 'projects.contractors',
        kind: 'MENU',
        nameKey: 'menus.contractorManagement',
      },
    ],
  },
  {
    code: 'stakeholders',
    kind: 'MODULE',
    nameKey: 'modules.stakeholders',
    children: [
      { code: 'stakeholders.projects', kind: 'MENU', nameKey: 'menus.stakeholderProjects' },
      { code: 'stakeholders.progress', kind: 'MENU', nameKey: 'menus.stakeholderProgress' },
      {
        code: 'stakeholders.correspondence',
        kind: 'MENU',
        nameKey: 'menus.stakeholderCorrespondence',
      },
      { code: 'stakeholders.inbox', kind: 'MENU', nameKey: 'menus.stakeholderInbox' },
      { code: 'stakeholders.reports', kind: 'MENU', nameKey: 'menus.stakeholderReports' },
      {
        code: 'stakeholders.port-sales-reports',
        kind: 'MENU',
        nameKey: 'menus.portSalesReports',
      },
      {
        code: 'stakeholders.ticket-tariffs',
        kind: 'MENU',
        nameKey: 'menus.ticketTariffs',
      },
    ],
  },
  {
    code: 'food-reservation',
    kind: 'MODULE',
    nameKey: 'modules.foodReservation',
    children: [
      {
        code: 'food-reservation.foods',
        kind: 'MENU',
        nameKey: 'menus.foodManagement',
      },
      {
        code: 'food-reservation.restaurants',
        kind: 'MENU',
        nameKey: 'menus.restaurantManagement',
      },
      {
        code: 'food-reservation.unit-reps',
        kind: 'MENU',
        nameKey: 'menus.unitReps',
      },
      {
        code: 'food-reservation.reserve',
        kind: 'MENU',
        nameKey: 'menus.foodReserve',
      },
      {
        code: 'food-reservation.my-orders',
        kind: 'MENU',
        nameKey: 'menus.foodMyOrders',
      },
      {
        code: 'food-reservation.my-report',
        kind: 'MENU',
        nameKey: 'menus.foodMyReport',
      },
      {
        code: 'food-reservation.history',
        kind: 'MENU',
        nameKey: 'menus.foodReservationHistory',
      },
      {
        code: 'food-reservation.report',
        kind: 'MENU',
        nameKey: 'menus.foodReservationReport',
      },
      {
        code: 'food-reservation.cost-estimate',
        kind: 'MENU',
        nameKey: 'menus.foodCostEstimate',
      },
      {
        code: 'food-reservation.unit-report',
        kind: 'MENU',
        nameKey: 'menus.foodUnitReport',
      },
    ],
  },
  {
    code: 'qeshm-organization',
    kind: 'MODULE',
    nameKey: 'modules.qeshmOrganization',
    children: [
      {
        code: 'qeshm-organization.info',
        kind: 'MENU',
        nameKey: 'menus.organization',
      },
      {
        code: 'qeshm-organization.units',
        kind: 'MENU',
        nameKey: 'menus.organizationUnits',
      },
      {
        code: 'qeshm-organization.unit-kinds',
        kind: 'MENU',
        nameKey: 'menus.organizationUnitKinds',
      },
      {
        code: 'qeshm-organization.positions',
        kind: 'MENU',
        nameKey: 'menus.organizationPositions',
      },
      {
        code: 'qeshm-organization.employees',
        kind: 'MENU',
        nameKey: 'menus.organizationEmployees',
      },
    ],
  },
  {
    code: 'qeshmondi',
    kind: 'MODULE',
    nameKey: 'modules.qeshmondi',
    children: [
      { code: 'qeshmondi.citizens', kind: 'MENU', nameKey: 'menus.qeshmondiCitizens' },
      { code: 'qeshmondi.update', kind: 'MENU', nameKey: 'menus.qeshmondiUpdate' },
      { code: 'qeshmondi.sync-logs', kind: 'MENU', nameKey: 'menus.qeshmondiSyncLogs' },
    ],
  },
  {
    code: 'light-assets',
    kind: 'MODULE',
    nameKey: 'modules.lightAssets',
    children: [
      { code: 'light-assets.vehicles', kind: 'MENU', nameKey: 'menus.vehicles' },
      {
        code: 'light-assets.vehicle-brands',
        kind: 'MENU',
        nameKey: 'menus.vehicleBrands',
      },
      {
        code: 'light-assets.vehicle-reports',
        kind: 'MENU',
        nameKey: 'menus.vehicleReports',
      },
    ],
  },
  {
    code: 'base-info',
    kind: 'MODULE',
    nameKey: 'modules.baseInfo',
    children: [
      { code: 'base-info.countries', kind: 'MENU', nameKey: 'menus.countries' },
      { code: 'base-info.provinces', kind: 'MENU', nameKey: 'menus.provinces' },
      { code: 'base-info.cities', kind: 'MENU', nameKey: 'menus.cities' },
    ],
  },
  {
    code: 'management',
    kind: 'MODULE',
    nameKey: 'modules.management',
    children: [
      { code: 'management.users', kind: 'MENU', nameKey: 'menus.users' },
      { code: 'management.roles', kind: 'MENU', nameKey: 'menus.roles' },
    ],
  },
  {
    code: 'board',
    kind: 'MODULE',
    nameKey: 'modules.board',
    children: [
      { code: 'board.search', kind: 'MENU', nameKey: 'menus.boardSmartSearch' },
      { code: 'board.minutes', kind: 'MENU', nameKey: 'menus.boardMinutes' },
      { code: 'board.resolutions', kind: 'MENU', nameKey: 'menus.boardResolutions' },
      { code: 'board.reports', kind: 'MENU', nameKey: 'menus.boardReports' },
      { code: 'board.calendar', kind: 'MENU', nameKey: 'menus.boardCalendar' },
      { code: 'board.requests', kind: 'MENU', nameKey: 'menus.boardRequests' },
      { code: 'board.plans', kind: 'MENU', nameKey: 'menus.boardPlans' },
      { code: 'board.permissions', kind: 'MENU', nameKey: 'menus.boardPermissions' },
    ],
  },
];

const permissionCodes = new Set<string>();

function collectCodes(nodes: PermissionNode[]) {
  for (const node of nodes) {
    permissionCodes.add(node.code);
    if (node.children) collectCodes(node.children);
  }
}

collectCodes(PERMISSION_TREE);

export function isKnownPermissionCode(code: string) {
  return permissionCodes.has(code);
}

export function parentPermissionCode(code: string) {
  const index = code.lastIndexOf('.');
  return index > 0 ? code.slice(0, index) : null;
}
