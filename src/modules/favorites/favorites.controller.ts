import { Controller, Post, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'List user favorited creators and their live stream statuses' })
  async getMyFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.getMyFavorites(user.id);
  }

  @Post(':creatorId')
  @ApiOperation({ summary: 'Favorite or follow a creator' })
  async addFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('creatorId') creatorId: string,
  ) {
    return this.favoritesService.addFavorite(user.id, creatorId);
  }

  @Delete(':creatorId')
  @ApiOperation({ summary: 'Unfavorite or unfollow a creator' })
  async removeFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('creatorId') creatorId: string,
  ) {
    return this.favoritesService.removeFavorite(user.id, creatorId);
  }
}
