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
import { CreateContractorPortalUserDto } from './dto/create-contractor-portal-user.dto';
import {
  FindContractorMembersQueryDto,
  FindContractorPaymentsQueryDto,
  FindContractorPortalUsersQueryDto,
  FindContractorsQueryDto,
} from './dto/find-contractors-query.dto';
import { UpdateContractorPortalUserDto } from './dto/update-contractor-portal-user.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { UpdateContractorMemberDto } from './dto/update-contractor-member.dto';
import { UpdateContractorPaymentDto } from './dto/update-contractor-payment.dto';

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

  @Get(':id/users')
  findPortalUsers(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Query() query: FindContractorPortalUsersQueryDto,
  ) {
    return this.contractors.findPortalUsers(projectId, contractorId, query);
  }

  @Post(':id/users')
  createPortalUser(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Body() dto: CreateContractorPortalUserDto,
  ) {
    return this.contractors.createPortalUser(projectId, contractorId, dto);
  }

  @Get(':id/users/:userId')
  findPortalUser(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('userId') userId: string,
  ) {
    return this.contractors.findPortalUser(projectId, contractorId, userId);
  }

  @Patch(':id/users/:userId')
  updatePortalUser(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateContractorPortalUserDto,
  ) {
    return this.contractors.updatePortalUser(projectId, contractorId, userId, dto);
  }

  @Delete(':id/users/:userId')
  removePortalUser(
    @Param('projectId') projectId: string,
    @Param('id') contractorId: string,
    @Param('userId') userId: string,
  ) {
    return this.contractors.removePortalUser(projectId, contractorId, userId);
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
