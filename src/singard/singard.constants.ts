export const SINGARD_DEFAULT_PASSWORD = '11111111';
export const SINGARD_CITIZEN_ROLE_CODE = 'CITIZEN';

export const SINGARD_MAX_IMAGES = 5;
export const SINGARD_MAX_AUDIO = 1;
export const SINGARD_MAX_VIDEO = 1;
export const SINGARD_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const SINGARD_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const SINGARD_MAX_AUDIO_MS = 3 * 60 * 1000;

export const singardFeedbackKinds = [
  'SUGGESTION',
  'COMPLAINT',
  'CRITICISM',
  'REPORT',
] as const;

export const singardFeedbackStatuses = [
  'NEW',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
] as const;

export const singardActivityKinds = ['NOTE', 'CONTACT'] as const;
