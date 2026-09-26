import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PortalActor = {
  id: string;
  contractorId: string | null;
};

@Injectable()
export class StakeholdersAccess {
  constructor(private readonly prisma: PrismaService) {}

  async actor(userId: string | undefined): Promise<PortalActor> {
    if (!userId) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, contractorId: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  contractorId(actor: PortalActor) {
    if (!actor.contractorId) {
      throw new ForbiddenException('این عملیات فقط برای کاربر پیمانکار است');
    }
    return actor.contractorId;
  }

  contractorWhere(actor: PortalActor) {
    return actor.contractorId ? { contractorId: actor.contractorId } : {};
  }

  async assertAssignedProject(contractorId: string, projectId: string) {
    const contractor = await this.prisma.projectContractor.findUnique({
      where: { id: contractorId },
      select: { id: true, projectId: true },
    });
    if (!contractor) {
      throw new NotFoundException('پیمانکار یافت نشد');
    }
    if (contractor.projectId === projectId) {
      return;
    }
    const link = await this.prisma.projectContractorProject.findUnique({
      where: { contractorId_projectId: { contractorId, projectId } },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException('این پروژه به پیمانکار تخصیص داده نشده است');
    }
  }
}
