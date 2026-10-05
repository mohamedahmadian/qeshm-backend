import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FindQeshmondiSyncLogsQueryDto } from './dto/find-qeshmondi-sync-logs-query.dto';
import { SaveQeshmondiSqlConnectionDto } from './dto/save-qeshmondi-sql-connection.dto';
import { QeshmondiSyncService } from './qeshmondi-sync.service';

type RequestUser = { id: string };

@Controller('users')
export class QeshmondiSyncController {
  constructor(private readonly sync: QeshmondiSyncService) {}

  @Get('qeshmondi-sql-connection')
  getConnection() {
    return this.sync.getConnection();
  }

  @Put('qeshmondi-sql-connection')
  saveConnection(
    @Body() dto: SaveQeshmondiSqlConnectionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.sync.saveConnection(dto, user?.id);
  }

  @Post('qeshmondi-sql-connection/test')
  testConnection() {
    return this.sync.testConnection();
  }

  @Post('qeshmondi-sync')
  beginDatabaseSync(@CurrentUser() user: RequestUser | undefined) {
    return this.sync.beginDatabaseSync(user?.id);
  }

  @Get('qeshmondi-sync-logs')
  findLogs(@Query() query: FindQeshmondiSyncLogsQueryDto) {
    return this.sync.findLogs(query);
  }

  @Get('qeshmondi-sync-logs/:id')
  findLog(@Param('id') id: string) {
    return this.sync.findLog(id);
  }
}
