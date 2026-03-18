import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceScannerService } from './invoice-scanner.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { PrismaService } from '../../prisma/prisma.service';

class ScanInvoiceDto {
  @IsString()
  imageBase64!: string;

  @IsString()
  mimeType!: string;
}

class MatchItemDto {
  @IsString() name!: string;
  @IsOptional() @IsString() mxik?: string | null;
}

class MatchProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchItemDto)
  items!: MatchItemDto[];
}

@ApiTags('invoice')
@Controller('invoice')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class InvoiceScannerController {
  constructor(
    private readonly scannerService: InvoiceScannerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plan')
  @ApiOperation({ summary: 'Get the invoice scanning plan and credit balance for the current store' })
  async getPlan(@CurrentUser('storeId') storeId: string) {
    const store = storeId
      ? await this.prisma.store.findUnique({
          where: { id: storeId },
          select: { plan: true, aiCredits: true },
        })
      : null;
    return {
      plan: store?.plan ?? 'free',
      balance_usd: store?.plan === 'paid' ? Number(store.aiCredits) : null,
    };
  }

  @Post('scan')
  @ApiOperation({ summary: 'Scan an invoice image/PDF with OCR (tier based on store plan)' })
  async scan(
    @Body() body: ScanInvoiceDto,
    @CurrentUser('storeId') storeId: string,
  ) {
    const store = storeId
      ? await this.prisma.store.findUnique({
          where: { id: storeId },
          select: { plan: true, aiCredits: true },
        })
      : null;

    const plan = store?.plan ?? 'free';

    const result = plan === 'paid'
      ? await this.scannerService.scanPaid(body.imageBase64, body.mimeType)
      : await this.scannerService.scanFree(body.imageBase64, body.mimeType);

    // For paid plan: deduct billed cost (Anthropic cost × 1.3) from credit balance
    if (plan === 'paid' && storeId && result.cost_usd) {
      const billedAmount = result.cost_usd * 1.3;
      const updated = await this.prisma.store.update({
        where: { id: storeId },
        data: { aiCredits: { decrement: billedAmount } },
        select: { aiCredits: true },
      });
      return { ...result, balance_usd: Number(updated.aiCredits) };
    }

    return result;
  }

  @Post('match-products')
  @ApiOperation({ summary: 'Match scanned item names to store products' })
  async matchProducts(
    @Body() body: MatchProductsDto,
    @CurrentStore() storeId: string,
  ) {
    const products = await this.prisma.product.findMany({
      where: { storeId, active: true },
      select: { id: true, nameRu: true, nameUz: true },
    });

    return body.items.map((item) => {
      const needle = item.name.toLowerCase();

      // Try exact match first
      let match = products.find(
        (p) =>
          p.nameRu.toLowerCase() === needle ||
          p.nameUz.toLowerCase() === needle,
      );
      if (match) {
        return { scannedName: item.name, matchedProductId: String(match.id), matchedProductNameRu: match.nameRu, matchedProductNameUz: match.nameUz, confidence: 'exact' as const };
      }

      // Partial contains match
      match = products.find(
        (p) =>
          p.nameRu.toLowerCase().includes(needle) ||
          p.nameUz.toLowerCase().includes(needle) ||
          needle.includes(p.nameRu.toLowerCase()) ||
          needle.includes(p.nameUz.toLowerCase()),
      );
      if (match) {
        return { scannedName: item.name, matchedProductId: String(match.id), matchedProductNameRu: match.nameRu, matchedProductNameUz: match.nameUz, confidence: 'medium' as const };
      }

      return { scannedName: item.name, matchedProductId: null, matchedProductNameRu: null, matchedProductNameUz: null, confidence: 'none' as const };
    });
  }
}
