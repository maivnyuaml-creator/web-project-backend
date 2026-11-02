import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Chat')
@Controller('rooms/:roomId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Public()
  @Get('history')
  @ApiOperation({ summary: 'Get recent room chat messages history' })
  async getChatHistory(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.chatService.getRecentMessages(roomId, limitNum);
  }
}
