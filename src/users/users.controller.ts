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
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CheckIdentityDto } from './dto/check-identity.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import { UsersService } from './users.service';

const excelUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query() query: FindUsersQueryDto) {
    return this.users.findAll(query);
  }

  @Post('identity-check')
  checkIdentity(@Body() dto: CheckIdentityDto) {
    return this.users.checkIdentityTaken(dto);
  }

  @Post('qeshmondi-import')
  @UseInterceptors(excelUpload)
  importQeshmondi(
    @UploadedFile()
    file: { buffer: Buffer; originalname: string },
  ) {
    return this.users.beginQeshmondiImport(file);
  }

  @Get('qeshmondi-imports/:jobId')
  qeshmondiImportStatus(@Param('jobId') jobId: string) {
    return this.users.qeshmondiImportStatus(jobId);
  }

  @Get('qeshmondi-imports/:jobId/export')
  async exportQeshmondiImport(
    @Param('jobId') jobId: string,
    @Query('kind') kind: string,
    @Res() res: Response,
  ) {
    const file = await this.users.exportQeshmondiImport(jobId, kind);
    const ascii = file.fileName.replace(/[^\w.\-]+/g, '_') || 'qeshmondi.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(':id/location-history')
  locationHistory(
    @Param('id') id: string,
    @Query() query: FindLocationHistoryQueryDto,
  ) {
    return this.users.findLocationHistory(id, query);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateUserLocationDto) {
    return this.users.updateLocation(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
