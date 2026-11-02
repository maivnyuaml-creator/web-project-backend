import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/media.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload an image or protected document asset' })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadMediaDto,
  ) {
    return this.mediaService.uploadMedia(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get signed download URL for a media asset' })
  async getMediaUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const isAdmin = user.roles.includes(Role.ADMINISTRATOR);
    return this.mediaService.getMediaUrl(id, user.id, isAdmin);
  }
}
