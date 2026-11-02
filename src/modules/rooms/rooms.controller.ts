import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, UpdateRoomDto } from './dto/rooms.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('Rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List live and public stream rooms with filters' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'isLive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  async listRooms(
    @Query('categoryId') categoryId?: string,
    @Query('isLive') isLive?: string,
    @Query('search') search?: string,
  ) {
    const isLiveBool = isLive !== undefined ? isLive === 'true' : undefined;
    return this.roomsService.listRooms({ categoryId, isLive: isLiveBool, search });
  }

  
  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List all room categories' })
  async listCategories() {
    return this.roomsService.listCategories();
  }

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'List featured streams' })
  async getFeatured() {
    return this.roomsService.getFeatured();
  }

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'List trending streams' })
  async getTrending() {
    return this.roomsService.getTrending();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get room details and playback access' })
  async getRoom(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.roomsService.getRoom(id, viewerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Post()
  @ApiOperation({ summary: 'Create a new stream room (Verified Creator only)' })
  async createRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ) {
    return this.roomsService.createRoom(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Update stream room settings (Room Creator only)' })
  async updateRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(id, user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Post(':id/go-live')
  @ApiOperation({ summary: 'Start broadcasting and mark room as live' })
  async goLive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.roomsService.goLive(id, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Post(':id/end')
  @ApiOperation({ summary: 'End broadcast and close streaming session' })
  async endStream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.roomsService.endStream(id, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VERIFIED_CREATOR)
  @Post(':id/stream-credentials/rotate')
  @ApiOperation({ summary: 'Rotate RTMP stream key and publishing credentials' })
  async rotateCredentials(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.roomsService.rotateCredentials(id, user.id);
  }
}
