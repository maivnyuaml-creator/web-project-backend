import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreatorApplicationsService } from './creator-applications.service';
import { CreateCreatorApplicationDto } from './dto/creator-application.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Creator Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('creator-applications')
export class CreatorApplicationsController {
  constructor(private readonly applicationsService: CreatorApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit verified adult creator application' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCreatorApplicationDto,
  ) {
    return this.applicationsService.createApplication(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user creator application status' })
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.getMyApplication(user.id);
  }
}
