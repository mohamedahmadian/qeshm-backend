import { Controller, Get } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('live-board')
  liveBoard() {
    return this.projects.liveBoard({});
  }
}
