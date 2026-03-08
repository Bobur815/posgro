import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { InvoiceScannerService } from './invoice-scanner.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

class ScanInvoiceDto {
  @IsString()
  imageBase64!: string;

  @IsString()
  mimeType!: string;
}

@ApiTags('invoice')
@Controller('invoice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class InvoiceScannerController {
  constructor(
    private readonly scannerService: InvoiceScannerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plan')
  @ApiOperation({ summary: 'Get the invoice scanning plan for the current store' })
  async getPlan(@CurrentUser('storeId') storeId: string) {
    const store = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { plan: true } })
      : null;
    return { plan: store?.plan ?? 'free' };
  }

  @Post('scan')
  @ApiOperation({ summary: 'Scan an invoice image/PDF with OCR (tier based on store plan)' })
  async scan(
    @Body() body: ScanInvoiceDto,
    @CurrentUser('storeId') storeId: string,
  ) {
    const store = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { plan: true } })
      : null;

    const plan = store?.plan ?? 'free';

    if (plan === 'paid') {
      return this.scannerService.scanPaid(body.imageBase64, body.mimeType);
    } else {
      return this.scannerService.scanFree(body.imageBase64, body.mimeType);
    }
  }
}
