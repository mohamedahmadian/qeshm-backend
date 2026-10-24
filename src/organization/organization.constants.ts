export const ORG_UNIT_KIND_CODES = {
  BOARD: 'BOARD',
  ADVISORS: 'ADVISORS',
  OFFICE: 'OFFICE',
  VICE: 'VICE',
  MANAGEMENT: 'MANAGEMENT',
  DEPARTMENT: 'DEPARTMENT',
} as const;

export type OrgUnitKindCode =
  (typeof ORG_UNIT_KIND_CODES)[keyof typeof ORG_UNIT_KIND_CODES];

export const SYSTEM_UNIT_KINDS = [
  { code: ORG_UNIT_KIND_CODES.BOARD, name: 'هیئت مدیره' },
  { code: ORG_UNIT_KIND_CODES.ADVISORS, name: 'مشاورین' },
  { code: ORG_UNIT_KIND_CODES.OFFICE, name: 'دفتر' },
  { code: ORG_UNIT_KIND_CODES.VICE, name: 'معاونت' },
  { code: ORG_UNIT_KIND_CODES.MANAGEMENT, name: 'مدیریت' },
  { code: ORG_UNIT_KIND_CODES.DEPARTMENT, name: 'اداره' },
] as const;

export const ORG_UNIT_KINDS_NEEDING_VICE: readonly string[] = [
  ORG_UNIT_KIND_CODES.MANAGEMENT,
  ORG_UNIT_KIND_CODES.DEPARTMENT,
];

export const BOARD_DEPUTY_POSITION_CODE = 'DEPUTY';
