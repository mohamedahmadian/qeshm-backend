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
import { BoardService } from './board.service';
import { BoardSignatoriesService } from './board-signatories.service';
import { CreateBoardSignatoryDto } from './dto/create-board-signatory.dto';
import { FindBoardSignatoriesQueryDto } from './dto/find-board-signatories-query.dto';
import { UpdateBoardSignatoryDto } from './dto/update-board-signatory.dto';

type RequestUser = { id: string };

@Controller('board/signatories')
export class BoardSignatoriesController {
  constructor(
    private readonly signatories: BoardSignatoriesService,
    private readonly board: BoardService,
  ) {}

  @Get()
  async findAll(
    @Query() query: FindBoardSignatoriesQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    await this.board.assertCanAccessBoard(user.id);
    return this.signatories.findAll(query);
  }

  @Post()
  async create(
    @Body() dto: CreateBoardSignatoryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    await this.board.assertCanManageBoardSettings(user.id);
    return this.signatories.create(dto);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    await this.board.assertCanManageBoardSettings(user.id);
    return this.signatories.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardSignatoryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    await this.board.assertCanManageBoardSettings(user.id);
    return this.signatories.update(id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    await this.board.assertCanManageBoardSettings(user.id);
    return this.signatories.remove(id);
  }
}
