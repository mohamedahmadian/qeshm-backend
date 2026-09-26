import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const contractorSortFields = [
  'name',
  'type',
  'nationalId',
  'ceoName',
  'timeEstimate',
  'costEstimate',
  'project',
  'projectCount',
] as const;

export const contractorMemberSortFields = [
  'firstName',
  'lastName',
  'phone',
  'role',
] as const;

export const contractorPortalUserSortFields = [
  'fullName',
  'username',
  'phone',
  'status',
] as const;

export const contractorPaymentSortFields = [
  'paidAt',
  'amount',
  'description',
] as const;

export const contractorProjectSortFields = [
  'systemName',
  'code',
  'status',
  'progressPercent',
  'operators',
] as const;

export class FindContractorsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorSortFields])
  sortBy?: (typeof contractorSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class FindContractorMembersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorMemberSortFields])
  sortBy?: (typeof contractorMemberSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class FindContractorPortalUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorPortalUserSortFields])
  sortBy?: (typeof contractorPortalUserSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class FindContractorPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorPaymentSortFields])
  sortBy?: (typeof contractorPaymentSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class FindContractorProjectsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorProjectSortFields])
  sortBy?: (typeof contractorProjectSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
