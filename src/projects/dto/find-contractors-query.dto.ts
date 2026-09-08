import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const contractorSortFields = [
  'name',
  'nationalId',
  'ceoName',
  'timeEstimate',
  'costEstimate',
] as const;

export const contractorMemberSortFields = [
  'firstName',
  'lastName',
  'phone',
  'role',
] as const;

export const contractorPhaseSortFields = [
  'name',
  'startDate',
  'endDate',
] as const;

export const contractorPaymentSortFields = [
  'paidAt',
  'amount',
  'description',
] as const;

export class FindContractorsQueryDto extends PaginationQueryDto {
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

export class FindContractorPhasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...contractorPhaseSortFields])
  sortBy?: (typeof contractorPhaseSortFields)[number];

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
