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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTicketTariffDto } from './dto/create-ticket-tariff.dto';
import { FindTicketTariffsQueryDto } from './dto/find-ticket-tariffs-query.dto';
import { UpdateTicketTariffDto } from './dto/update-ticket-tariff.dto';
import { TicketTariffActor, TicketTariffsService } from './ticket-tariffs.service';

@Controller('ticket-tariffs')
export class TicketTariffsController {
  constructor(private readonly tariffs: TicketTariffsService) {}

  @Get()
  findAll(@Query() query: FindTicketTariffsQueryDto) {
    return this.tariffs.findAll(query);
  }

  @Post()
  create(@CurrentUser() user: TicketTariffActor | undefined, @Body() dto: CreateTicketTariffDto) {
    return this.tariffs.create(user, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tariffs.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: TicketTariffActor | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateTicketTariffDto,
  ) {
    return this.tariffs.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: TicketTariffActor | undefined, @Param('id') id: string) {
    return this.tariffs.remove(user, id);
  }
}
