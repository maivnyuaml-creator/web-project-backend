import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShowsService } from './shows.service';
import { RequestShowDto, EndShowDto } from './dto/shows.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Shows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shows')
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a private or group show with a creator' })
  async requestShow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestShowDto,
  ) {
    return this.showsService.requestShow(user.id, dto);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Creator accepts pending show request' })
  async acceptShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') showId: string,
  ) {
    return this.showsService.acceptShow(showId, user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join active show and receive authorized private playback stream' })
  async joinShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') showId: string,
  ) {
    return this.showsService.joinShow(showId, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave or end active show session' })
  async leaveShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') showId: string,
    @Body() dto?: EndShowDto,
  ) {
    return this.showsService.endShow(showId, user.id, dto);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'Terminate show and calculate token billing' })
  async endShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') showId: string,
    @Body() dto?: EndShowDto,
  ) {
    return this.showsService.endShow(showId, user.id, dto);
  }
}
