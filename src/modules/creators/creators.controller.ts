import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreatorsService } from './creators.service';
import { UpdateCreatorProfileDto, CreateTipMenuItemDto } from './dto/creators.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('Creators')
@Controller('creators')
export class CreatorsController {
  constructor(private readonly creatorsService: CreatorsService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get verified creator public profile and live room status' })
  async getCreator(@Param('id') id: string) {
    return this.creatorsService.getCreator(id);
  }

  @Public()
  @Get(':id/tip-menu')
  @ApiOperation({ summary: 'Get creator active tip menu items' })
  async getTipMenu(@Param('id') id: string) {
    return this.creatorsService.getTipMenu(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Patch('me')
  @ApiOperation({ summary: 'Update creator stage settings and rates (Verified Creator only)' })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCreatorProfileDto,
  ) {
    return this.creatorsService.updateMyProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Post('me/tip-menu')
  @ApiOperation({ summary: 'Add a new tip menu item (Verified Creator only)' })
  async addTipMenuItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTipMenuItemDto,
  ) {
    return this.creatorsService.addTipMenuItem(user.id, dto);
  }
}
