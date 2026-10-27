import { IsIn } from 'class-validator';
import { inspectionFeedbackStatuses } from '../inspection.constants';

export class UpdateInspectionFeedbackStatusDto {
  @IsIn([...inspectionFeedbackStatuses])
  status: (typeof inspectionFeedbackStatuses)[number];
}