import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContractorsService } from './contractors.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { CreateContractorMemberDto } from './dto/create-contractor-member.dto';
import { CreateContractorPaymentDto } from './dto/create-contractor-payment.dto';
import { CreateContractorPhaseDto } from './dto/create-contractor-phase.dto';
import {
  FindContractorMembersQueryDto,
  FindContractorPaymentsQueryDto,
  FindContractorPhasesQueryDto,
  FindContractorsQueryDto,
} from './dto/find-contractors-query.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { UpdateContractorMemberDto } from './dto/update-contractor-member.dto';
import { UpdateContractorPaymentDto } from './dto/update-contractor-payment.dto';
import { UpdateContractorPhaseDto } from './dto/update-contractor-phase.dto';

@Controller('projects/:projectId/contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: FindContractorsQueryDto,
  ) {
    return this.contractors.findAll(projectId, query);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateContractorDto,
  ) {
    return this.contractors.create(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.contractors.findOne(projectId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContractorDto,
  ) {
    return this.contractors.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.contractors.remove(projectId, id);
  }

  @Get(':id/team')
  findMembers(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Query() query: FindContractorMembersQueryDto,
  ) {
    return this.contractors.findMembers(projectId, contractorId, query);
  }

  @Post(':id/team')
  createMember(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Body() dto: CreateContractorMemberDto,
  ) {
    return this.contractors.createMember(projectId, contractorId, dto);
  }

  @Get(':id/team/:memberId')
  findMember(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.contractors.findMember(projectId, contractorId, memberId);
  }

  @Patch(':id/team/:memberId')
  updateMember(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateContractorMemberDto,
  ) {
    return this.contractors.updateMember(
      projectId,
      contractorId,
      memberId,
      dto,
    );
  }

  @Delete(':id/team/:memberId')
  removeMember(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.contractors.removeMember(projectId, contractorId, memberId);
  }

  @Get(':id/phases')
  findPhases(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Query() query: FindContractorPhasesQueryDto,
  ) {
    return this.contractors.findPhases(projectId, contractorId, query);
  }

  @Post(':id/phases')
  createPhase(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Body() dto: CreateContractorPhaseDto,
  ) {
    return this.contractors.createPhase(projectId, contractorId, dto);
  }

  @Get(':id/phases/:phaseId')
  findPhase(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.contractors.findPhase(projectId, contractorId, phaseId);
  }

  @Patch(':id/phases/:phaseId')
  updatePhase(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: UpdateContractorPhaseDto,
  ) {
    return this.contractors.updatePhase(projectId, contractorId, phaseId, dto);
  }

  @Delete(':id/phases/:phaseId')
  removePhase(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.contractors.removePhase(projectId, contractorId, phaseId);
  }

  @Get(':id/payments')
  findPayments(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Query() query: FindContractorPaymentsQueryDto,
  ) {
    return this.contractors.findPayments(projectId, contractorId, query);
  }

  @Post(':id/payments')
  createPayment(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Body() dto: CreateContractorPaymentDto,
  ) {
    return this.contractors.createPayment(projectId, contractorId, dto);
  }

  @Get(':id/payments/:paymentId')
  findPayment(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.contractors.findPayment(projectId, contractorId, paymentId);
  }

  @Patch(':id/payments/:paymentId')
  updatePayment(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateContractorPaymentDto,
  ) {
    return this.contractors.updatePayment(
      projectId,
      contractorId,
      paymentId,
      dto,
    );
  }

  @Delete(':id/payments/:paymentId')
  removePayment(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.contractors.removePayment(projectId, contractorId, paymentId);
  }
}
