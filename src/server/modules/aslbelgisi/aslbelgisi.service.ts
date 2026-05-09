import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ASL_BELGISI_BASE = 'https://xtrace.aslbelgisi.uz';

export interface McPublicInfo {
  isValid: boolean;
  status?: string;
  extendedStatus?: string;
  gtin?: string;
  productId?: string;
  productionDate?: string;
  expirationDate?: string;
  productSeries?: string;
  packageType?: string;
  issuerName?: string;
}

@Injectable()
export class AslBelgisiService {
  private readonly logger = new Logger(AslBelgisiService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ASLBELGISI_API_KEY') ?? '';
    this.logger.log(`API key configured: ${this.apiKey ? 'YES (' + this.apiKey.slice(0, 6) + '...)' : 'NO'}`);
  }

  async verifyCode(markingCode: string): Promise<McPublicInfo> {
    if (!this.apiKey) {
      this.logger.error('ASLBELGISI_API_KEY is not set');
      throw new HttpException('ASL BELGISI API key not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    this.logger.log(`Verifying MC (${markingCode.length} chars): ${markingCode.slice(0, 30)}...`);

    let res: Response;
    try {
      res = await fetch(`${ASL_BELGISI_BASE}/public/api/cod/public/codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ codes: [markingCode], addCodeHistory: false }),
      });
    } catch (e) {
      this.logger.error('Network error reaching ASL BELGISI', e);
      throw new HttpException('ASL BELGISI service unreachable', HttpStatus.BAD_GATEWAY);
    }

    const rawBody = await res.text();
    this.logger.log(`ASL BELGISI status=${res.status} body=${rawBody.slice(0, 300)}`);

    if (!res.ok) {
      throw new HttpException(
        `ASL BELGISI returned ${res.status}: ${rawBody.slice(0, 200)}`,
        res.status,
      );
    }

    let data: any[];
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new HttpException('ASL BELGISI returned invalid JSON', HttpStatus.BAD_GATEWAY);
    }

    if (!data?.length) return { isValid: false };

    const mc = data[0];
    return {
      isValid: true,
      status: mc.status,
      extendedStatus: mc.extendedStatus,
      gtin: mc.gtin,
      productId: mc.productId,
      productionDate: mc.productionDate,
      expirationDate: mc.expirationDate,
      productSeries: mc.productSeries,
      packageType: mc.packageType,
      issuerName: mc.issuerShortInfo?.issuerName?.ru,
    };
  }
}
