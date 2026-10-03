import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketTariffDto } from './create-ticket-tariff.dto';

export class UpdateTicketTariffDto extends PartialType(CreateTicketTariffDto) {}
