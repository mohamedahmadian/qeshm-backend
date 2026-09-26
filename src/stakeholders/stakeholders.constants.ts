export const stakeholderCorrespondenceKinds = [
  'ACTION_REQUEST',
  'INQUIRY',
  'NOTICE',
  'DOCUMENT',
] as const;

export const stakeholderCorrespondenceStatuses = [
  'SENT',
  'IN_REVIEW',
  'ANSWERED',
  'CLOSED',
] as const;

export const stakeholderActionResults = ['ACCEPTED', 'REJECTED', 'DONE'] as const;

export const stakeholderMessageSides = ['CONTRACTOR', 'ORGANIZATION'] as const;

export const progressSortFields = [
  'occurredAt',
  'progressPercent',
  'project',
  'contractor',
  'author',
  'createdAt',
] as const;

export const correspondenceSortFields = [
  'subject',
  'kind',
  'status',
  'project',
  'contractor',
  'dueDate',
  'createdAt',
] as const;

export const projectSortFields = [
  'systemName',
  'code',
  'status',
  'progressPercent',
  'reportedPercent',
  'startDate',
] as const;
