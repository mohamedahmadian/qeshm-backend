import { IsUUID } from 'class-validator';

export class CreateContractorProjectDto {
  @IsUUID()
  projectId: string;
}
