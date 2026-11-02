import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user active sessions' })
  async getMySessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionsService.getUserSessions(user.id);
  }

  @Delete('other')
  @ApiOperation({ summary: 'Revoke all other active sessions except current' })
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionsService.revokeOtherSessions(user.id, user.sessionId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a specific session by ID' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ) {
    return this.sessionsService.revokeSession(user.id, sessionId);
  }
}
