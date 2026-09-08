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
import { CheckIdentityDto } from './dto/check-identity.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import { UsersService } from './users.service';

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
