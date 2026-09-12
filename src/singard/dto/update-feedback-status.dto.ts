import { IsIn } from 'class-validator';
import { singardFeedbackStatuses } from '../singard.constants';

export class UpdateSingardFeedbackStatusDto {
  @IsIn([...singardFeedbackStatuses])
  status: (typeof singardFeedbackStatuses)[number];
}