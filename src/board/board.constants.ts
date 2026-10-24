import { BoardRequestStatus, BoardStage } from '../generated/prisma/client';

export const BOARD_LEADERSHIP_POSITION_CODES = [
  'DEPUTY',
  'MANAGER',
  'HEAD',
  'SUPERVISOR',
  'SECRETARY',
] as const;

export const BOARD_REQUEST_POSITION_CODES = [
  'DEPUTY',
  'MANAGER',
  'HEAD',
  'SUPERVISOR',
] as const;

export const BOARD_MANAGER_POSITION_CODE = 'MANAGER';
export const BOARD_DEPUTY_POSITION_CODE = 'DEPUTY';
export const BOARD_SECRETARY_POSITION_CODE = 'SECRETARY';
export const BOARD_EXPERT_POSITION_CODE = 'EXPERT';

export const AUTO_MANAGEMENT_COMMENT =
  'تأیید خودکار — سمت ثبت‌شده معاون است';

export const boardReviewStages = [
  BoardStage.MANAGEMENT,
  BoardStage.LEGAL,
  BoardStage.BUDGET,
  BoardStage.SECRETARY,
  BoardStage.CEO,
] as const;

export const boardPermissionStages = [
  BoardStage.LEGAL,
  BoardStage.BUDGET,
  BoardStage.SECRETARY,
  BoardStage.CEO,
] as const;

export type BoardReviewStage = (typeof boardReviewStages)[number];

export const boardRequestKinds = ['NORMAL', 'MANAGEMENT'] as const;

export const boardRequestStatuses = [
  BoardRequestStatus.PENDING_REVIEW,
  BoardRequestStatus.PENDING_LEGAL,
  BoardRequestStatus.PENDING_BUDGET,
  BoardRequestStatus.PENDING_SECRETARY,
  BoardRequestStatus.PENDING_CEO,
  BoardRequestStatus.APPROVED,
  BoardRequestStatus.REJECTED,
] as const;

export const boardRequestSortFields = [
  'trackingNo',
  'requestedAt',
  'subject',
  'status',
  'unit',
  'createdBy',
  'createdAt',
] as const;

export const MAX_BOARD_ATTACHMENTS = 20;
export const MAX_BOARD_MINUTES_MEMBERS = 80;

export const boardMinutesAttendances = ['PRESENT', 'ABSENT'] as const;

export const boardMinutesSortFields = [
  'heldAt',
  'subject',
  'request',
  'memberCount',
  'resolutionCount',
  'createdAt',
] as const;

export const boardMinutesResolutionSortFields = [
  'title',
  'unit',
  'dueDate',
  'minutes',
  'request',
  'createdAt',
] as const;

export function statusForStage(stage: BoardStage): BoardRequestStatus | null {
  switch (stage) {
    case BoardStage.MANAGEMENT:
      return BoardRequestStatus.PENDING_REVIEW;
    case BoardStage.LEGAL:
      return BoardRequestStatus.PENDING_LEGAL;
    case BoardStage.BUDGET:
      return BoardRequestStatus.PENDING_BUDGET;
    case BoardStage.SECRETARY:
      return BoardRequestStatus.PENDING_SECRETARY;
    case BoardStage.CEO:
      return BoardRequestStatus.PENDING_CEO;
    default:
      return null;
  }
}

export function stageForStatus(status: BoardRequestStatus): BoardStage | null {
  switch (status) {
    case BoardRequestStatus.PENDING_REVIEW:
      return BoardStage.MANAGEMENT;
    case BoardRequestStatus.PENDING_LEGAL:
      return BoardStage.LEGAL;
    case BoardRequestStatus.PENDING_BUDGET:
      return BoardStage.BUDGET;
    case BoardRequestStatus.PENDING_SECRETARY:
      return BoardStage.SECRETARY;
    case BoardRequestStatus.PENDING_CEO:
      return BoardStage.CEO;
    default:
      return null;
  }
}

export function referredAtDataForStatus(
  status: BoardRequestStatus,
  at: Date,
): {
  legalReferredAt?: Date;
  budgetReferredAt?: Date;
  secretaryReferredAt?: Date;
  ceoReferredAt?: Date;
} {
  switch (status) {
    case BoardRequestStatus.PENDING_LEGAL:
      return { legalReferredAt: at };
    case BoardRequestStatus.PENDING_BUDGET:
      return { budgetReferredAt: at };
    case BoardRequestStatus.PENDING_SECRETARY:
      return { secretaryReferredAt: at };
    case BoardRequestStatus.PENDING_CEO:
      return { ceoReferredAt: at };
    default:
      return {};
  }
}

export function nextStatusAfterApprove(
  status: BoardRequestStatus,
  kind: (typeof boardRequestKinds)[number] = 'NORMAL',
): BoardRequestStatus | null {
  if (kind === 'MANAGEMENT') {
    if (status === BoardRequestStatus.PENDING_CEO) {
      return BoardRequestStatus.APPROVED;
    }
    return null;
  }
  switch (status) {
    case BoardRequestStatus.PENDING_REVIEW:
      return BoardRequestStatus.PENDING_LEGAL;
    case BoardRequestStatus.PENDING_LEGAL:
      return BoardRequestStatus.PENDING_BUDGET;
    case BoardRequestStatus.PENDING_BUDGET:
      return BoardRequestStatus.PENDING_SECRETARY;
    case BoardRequestStatus.PENDING_SECRETARY:
      return BoardRequestStatus.PENDING_CEO;
    case BoardRequestStatus.PENDING_CEO:
      return BoardRequestStatus.APPROVED;
    default:
      return null;
  }
}
