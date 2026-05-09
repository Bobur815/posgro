import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ASLBELGISI_API_KEY') ?? '';
  }

  async verifyCode(markingCode: string): Promise<McPublicInfo> {
    if (!this.apiKey) {
      throw new HttpException('ASL BELGISI API key not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    let res: Response;
    try {
      res = await fetch(`${ASL_BELGISI_BASE}/public/api/cod/public/codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ codes: [markingCode], addCodeHistory: false }),
      });
    } catch {
      throw new HttpException('ASL BELGISI service unreachable', HttpStatus.BAD_GATEWAY);
    }

    if (!res.ok) {
      throw new HttpException(`ASL BELGISI returned ${res.status}`, res.status);
    }

    const data = await res.json() as any[];
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
