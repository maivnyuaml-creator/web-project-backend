import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TipsService } from './tips.service';
import { SendTipDto } from './dto/tips.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tips')
@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Send a token tip or tip menu item to a live room creator' })
  async sendTip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendTipDto,
  ) {
    return this.tipsService.sendTip(user.id, dto);
  }

  @Public()
  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get recent tips sent in a specific room' })
  async getRoomTips(@Param('roomId') roomId: string) {
    return this.tipsService.getRecentRoomTips(roomId);
  }
}
