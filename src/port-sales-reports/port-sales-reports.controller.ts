import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, type Options as MulterOptions } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePortSalesReportDto } from './dto/create-port-sales-report.dto';
import { FindPortSalesReportsQueryDto } from './dto/find-port-sales-reports-query.dto';
import { ExportPortTicketSalesQueryDto } from './dto/export-port-ticket-sales-query.dto';
import { FindPortTicketQuotaQueryDto } from './dto/find-port-ticket-quota-query.dto';
import { FindPortTicketSalesQueryDto } from './dto/find-port-ticket-sales-query.dto';
import { UpdatePortSalesReportDto } from './dto/update-port-sales-report.dto';
import { MAX_PORT_SALES_EXCEL_BYTES } from './port-sales.constants';
import {
  PortSalesReportsService,
  type PortSalesActor,
} from './port-sales-reports.service';

type UploadedExcel = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const excelUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_PORT_SALES_EXCEL_BYTES },
  defParamCharset: 'utf8',
} as MulterOptions);

@Controller('port-sales-reports')
export class PortSalesReportsController {
  constructor(private readonly reports: PortSalesReportsService) {}

  @Get()
  findAll(
    @CurrentUser() user: PortSalesActor | undefined,
    @Query() query: FindPortSalesReportsQueryDto,
  ) {
    return this.reports.findAll(user, query);
  }

  @Post()
  @UseInterceptors(excelUpload)
  create(
    @CurrentUser() user: PortSalesActor | undefined,
    @Body() dto: CreatePortSalesReportDto,
    @UploadedFile() file: UploadedExcel,
  ) {
    return this.reports.beginCreate(user, dto, file);
  }

  @Get('imports/:jobId')
  importStatus(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('jobId') jobId: string,
  ) {
    return this.reports.importStatus(user, jobId);
  }

  @Get(':id/tickets/export')
  async exportTickets(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('id') id: string,
    @Query() query: ExportPortTicketSalesQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reports.exportTickets(user, id, query);
    const ascii = file.fileName.replace(/[^\w.\-]+/g, '_') || 'tickets.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }

  @Get(':id/tickets/quota')
  findQuota(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('id') id: string,
    @Query() query: FindPortTicketQuotaQueryDto,
  ) {
    return this.reports.findQuota(user, id, query);
  }

  @Get(':id/tickets')
  findTickets(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('id') id: string,
    @Query() query: FindPortTicketSalesQueryDto,
  ) {
    return this.reports.findTickets(user, id, query);
  }

  @Post(':id/verify-qeshmondi')
  verifyQeshmondi(@CurrentUser() user: PortSalesActor | undefined, @Param('id') id: string) {
    return this.reports.verifyQeshmondi(user, id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: PortSalesActor | undefined, @Param('id') id: string) {
    return this.reports.approve(user, id);
  }

  @Post(':id/revoke-approval')
  revokeApproval(@CurrentUser() user: PortSalesActor | undefined, @Param('id') id: string) {
    return this.reports.revokeApproval(user, id);
  }

  @Get(':id/file')
  async download(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.reports.filePayload(user, id);
    const name = file.originalName?.trim() || 'port-sales.xlsx';
    const ascii = name.replace(/[^\w.\-]+/g, '_') || 'port-sales.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.data.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.send(file.data);
  }

  @Get(':id')
  findOne(@CurrentUser() user: PortSalesActor | undefined, @Param('id') id: string) {
    return this.reports.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: PortSalesActor | undefined,
    @Param('id') id: string,
    @Body() dto: UpdatePortSalesReportDto,
  ) {
    return this.reports.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: PortSalesActor | undefined, @Param('id') id: string) {
    return this.reports.remove(user, id);
  }
}
