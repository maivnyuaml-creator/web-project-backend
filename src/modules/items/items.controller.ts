import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Items')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all sample items (Frontend connectivity test)' })
  @ApiResponse({ status: 200, description: 'List of items retrieved successfully' })
  findAll() {
    return this.itemsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single item by ID' })
  @ApiParam({ name: 'id', description: 'Item ID', example: 'item-1' })
  @ApiResponse({ status: 200, description: 'Item retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Public()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an item by ID' })
  @ApiParam({ name: 'id', description: 'Item ID', example: 'item-1' })
  @ApiResponse({ status: 200, description: 'Item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  delete(@Param('id') id: string) {
    return this.itemsService.delete(id);
  }
}
