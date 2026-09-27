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
import { CreatePortSalesReportDto } from './dto/create-port-sales-report.dto';
import { FindPortSalesReportsQueryDto } from './dto/find-port-sales-reports-query.dto';
import { ExportPortTicketSalesQueryDto } from './dto/export-port-ticket-sales-query.dto';
import { FindPortTicketSalesQueryDto } from './dto/find-port-ticket-sales-query.dto';
import { UpdatePortSalesReportDto } from './dto/update-port-sales-report.dto';
import { MAX_PORT_SALES_EXCEL_BYTES } from './port-sales.constants';
import { PortSalesReportsService } from './port-sales-reports.service';

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
  findAll(@Query() query: FindPortSalesReportsQueryDto) {
    return this.reports.findAll(query);
  }

  @Post()
  @UseInterceptors(excelUpload)
  create(
    @Body() dto: CreatePortSalesReportDto,
    @UploadedFile() file: UploadedExcel,
  ) {
    return this.reports.beginCreate(dto, file);
  }

  @Get('imports/:jobId')
  importStatus(@Param('jobId') jobId: string) {
    return this.reports.importStatus(jobId);
  }

  @Get(':id/tickets/export')
  async exportTickets(
    @Param('id') id: string,
    @Query() query: ExportPortTicketSalesQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reports.exportTickets(id, query);
    const ascii = file.fileName.replace(/[^\w.\-]+/g, '_') || 'tickets.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }

  @Get(':id/tickets')
  findTickets(
    @Param('id') id: string,
    @Query() query: FindPortTicketSalesQueryDto,
  ) {
    return this.reports.findTickets(id, query);
  }

  @Post(':id/verify-qeshmondi')
  verifyQeshmondi(@Param('id') id: string) {
    return this.reports.verifyQeshmondi(id);
  }

  @Get(':id/file')
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.reports.filePayload(id);
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
  findOne(@Param('id') id: string) {
    return this.reports.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePortSalesReportDto) {
    return this.reports.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reports.remove(id);
  }
}
