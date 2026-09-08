import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CheckIdentityDto } from './dto/check-identity.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import { UsersService } from './users.service';

type RequestUser = { id: string };

@Controller('account')
export class AccountController {
  constructor(private readonly users: UsersService) {}

  private requireUser(user?: RequestUser) {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  @Get()
  me(@CurrentUser() user: RequestUser | undefined) {
    return this.users.findOne(this.requireUser(user).id);
  }

  @Post('identity-check')
  checkIdentity(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CheckIdentityDto,
  ) {
    return this.users.checkIdentityTaken({
      ...dto,
      excludeId: this.requireUser(user).id,
    });
  }

  @Get('location-history')
  locationHistory(
    @CurrentUser() user: RequestUser | undefined,
    @Query() query: FindLocationHistoryQueryDto,
  ) {
    return this.users.findLocationHistory(this.requireUser(user).id, query);
  }

  @Delete('location-history/:id')
  removeLocationHistory(
    @CurrentUser() user: RequestUser | undefined,
    @Param('id') id: string,
  ) {
    return this.users.removeLocationHistory(this.requireUser(user).id, id);
  }

  @Delete('location-history')
  removeAllLocationHistory(@CurrentUser() user: RequestUser | undefined) {
    return this.users.removeAllLocationHistory(this.requireUser(user).id);
  }

  @Patch('location')
  updateLocation(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: UpdateUserLocationDto,
  ) {
    return this.users.updateLocation(this.requireUser(user).id, dto);
  }

  @Patch()
  update(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.updateOwnAccount(this.requireUser(user).id, dto);
  }
}
