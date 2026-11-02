import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTokenPackageDto, UpdateTokenPackageDto } from './dto/token-packages.dto';

@Injectable()
export class TokenPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActivePackages() {
    return this.prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { priceMinorUnits: 'asc' },
    });
  }

  async getPackage(id: string) {
    const pkg = await this.prisma.tokenPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Token package not found');
    return pkg;
  }

  async createPackage(dto: CreateTokenPackageDto) {
    return this.prisma.tokenPackage.create({
      data: {
        name: dto.name,
        tokenAmount: dto.tokenAmount,
        bonusTokens: dto.bonusTokens || 0,
        priceMinorUnits: dto.priceMinorUnits,
        currency: dto.currency || 'USD',
        isActive: true,
      },
    });
  }

  async updatePackage(id: string, dto: UpdateTokenPackageDto) {
    await this.getPackage(id);
    return this.prisma.tokenPackage.update({
      where: { id },
      data: dto,
    });
  }
}
