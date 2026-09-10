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
    code: 'projects',
    kind: 'MODULE',
    nameKey: 'modules.projects',
    children: [
      { code: 'projects.list', kind: 'MENU', nameKey: 'menus.projects' },
      { code: 'projects.reports', kind: 'MENU', nameKey: 'menus.projectReports' },
      {
        code: 'projects.liveBoard',
        kind: 'MENU',
        nameKey: 'menus.digitalTransformationLiveBoard',
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
        code: 'food-reservation.reserve',
        kind: 'MENU',
        nameKey: 'menus.foodReserve',
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
        code: 'qeshm-organization.positions',
        kind: 'MENU',
        nameKey: 'menus.organizationPositions',
      },
      {
        code: 'qeshm-organization.units',
        kind: 'MENU',
        nameKey: 'menus.organizationUnits',
      },
      {
        code: 'qeshm-organization.employees',
        kind: 'MENU',
        nameKey: 'menus.organizationEmployees',
      },
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
