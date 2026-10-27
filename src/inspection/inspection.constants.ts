export const INSPECTION_DEFAULT_PASSWORD = '11111111';
export const INSPECTION_CITIZEN_ROLE_CODE = 'CITIZEN';

export const INSPECTION_MAX_IMAGES = 5;
export const INSPECTION_MAX_AUDIO = 1;
export const INSPECTION_MAX_VIDEO = 1;
export const INSPECTION_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const INSPECTION_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const INSPECTION_MAX_AUDIO_MS = 3 * 60 * 1000;

export const inspectionKindIcons = [
  'lightbulb',
  'alert-triangle',
  'message-circle-heart',
  'flag',
  'megaphone',
  'sparkles',
  'heart-handshake',
  'message-square',
  'messages-square',
  'inbox',
  'clipboard-list',
  'shield',
  'map-pin',
  'building-2',
  'users',
  'hand-heart',
  'file-text',
  'scale',
  'gavel',
  'stamp',
] as const;

export const inspectionFeedbackStatuses = [
  'NEW',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
] as const;

export const inspectionActivityKinds = ['NOTE', 'CONTACT'] as const;
