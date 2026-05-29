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
          select: { aiPlan: true, balance: true },
        })
      : null;
    return {
      plan: store?.aiPlan ?? 'free',
      balance_uzs: store?.aiPlan === 'paid' ? Number(store.balance) : null,
    };
  }

  @Post('scan')
  @ApiOperation({ summary: 'Scan an invoice image/PDF with OCR (tier based on store plan)' })
  async scan(
    @Body() body: ScanInvoiceDto,
    @CurrentStore() storeId: string,
  ) {
    const store = storeId
      ? await this.prisma.store.findUnique({
          where: { id: storeId },
          select: { aiPlan: true, balance: true },
        })
      : null;

    const plan = store?.aiPlan ?? 'free';

    const result = plan === 'paid'
      ? await this.scannerService.scanPaid(body.imageBase64, body.mimeType)
      : await this.scannerService.scanFree(body.imageBase64, body.mimeType);

    // For paid plan: deduct billed cost (Anthropic cost × 1.3, converted to so'm) from balance.
    // balance is stored in UZS. Charge at scan time regardless of whether the user completes the flow.
    if (plan === 'paid' && storeId) {
      const UZS_PER_USD = 12_700;
      const chargedUzs = Math.round((result.cost_usd ?? 0) * 1.3 * UZS_PER_USD);
      const updated = await this.prisma.store.update({
        where: { id: storeId },
        data: { balance: { decrement: chargedUzs } },
        select: { balance: true },
      });
      return { ...result, charged_uzs: chargedUzs, balance_uzs: Number(updated.balance) };
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

      // Partial contains match — both sides must be at least 4 chars to avoid
      // false positives from single-letter or very short product names.
      const MIN_LEN = 4;
      if (needle.length >= MIN_LEN) {
        match = products.find((p) => {
          const pRu = p.nameRu.toLowerCase();
          const pUz = p.nameUz.toLowerCase();
          if (pRu.length >= MIN_LEN && needle.includes(pRu)) return true;
          if (pUz.length >= MIN_LEN && needle.includes(pUz)) return true;
          if (pRu.length >= MIN_LEN && pRu.includes(needle)) return true;
          if (pUz.length >= MIN_LEN && pUz.includes(needle)) return true;
          return false;
        });
      }
      if (match) {
        return { scannedName: item.name, matchedProductId: String(match.id), matchedProductNameRu: match.nameRu, matchedProductNameUz: match.nameUz, confidence: 'medium' as const };
      }

      return { scannedName: item.name, matchedProductId: null, matchedProductNameRu: null, matchedProductNameUz: null, confidence: 'none' as const };
    });
  }
}
