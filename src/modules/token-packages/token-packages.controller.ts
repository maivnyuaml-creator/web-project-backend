import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TokenPackagesService } from './token-packages.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Token Packages')
@Controller('token-packages')
export class TokenPackagesController {
  constructor(private readonly packagesService: TokenPackagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List available token purchase packages and pricing' })
  async listActivePackages() {
    return this.packagesService.listActivePackages();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get details for a specific token package' })
  async getPackage(@Param('id') id: string) {
    return this.packagesService.getPackage(id);
  }
}
