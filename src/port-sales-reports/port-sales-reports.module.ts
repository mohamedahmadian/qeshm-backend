import { Module } from '@nestjs/common';
import { PortSalesReportsController } from './port-sales-reports.controller';
import { PortSalesReportsService } from './port-sales-reports.service';

@Module({
  controllers: [PortSalesReportsController],
  providers: [PortSalesReportsService],
})
export class PortSalesReportsModule {}
