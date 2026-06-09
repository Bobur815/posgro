import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ASL_BELGISI_BASE = 'https://xtrace.aslbelgisi.uz';

// The asl-belgisi registry keys a marking code on AIs 01 (GTIN) + 21 (serial) only.
// The trailing crypto/verification group (AI 91/92/93) is NOT part of that key —
// including it makes /codes return an empty array (a false "not found"). Strip it.
function stripCryptoTail(code: string): string {
  // Real scans separate the crypto group with a GS byte (\x1d); cut at the first GS.
  const gsIdx = code.indexOf('\x1d');
  if (gsIdx !== -1) return code.slice(0, gsIdx);
  // No GS (e.g. manually entered): anchor past the 01+GTIN+21 header (18 chars) and
  // drop a trailing 91/92/93 group from the serial region, leaving the serial intact.
  if (code.length > 18 && /^01\d{14}21/.test(code)) {
    return code.slice(0, 18) + code.slice(18).replace(/9[123][^\x1d]*$/, '');
  }
  return code;
}

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

    const lookupCode = stripCryptoTail(markingCode);
    if (lookupCode !== markingCode) {
      this.logger.log(`Stripped crypto tail: ${markingCode.length} → ${lookupCode.length} chars`);
    }
    this.logger.log(`Verifying MC (${lookupCode.length} chars): ${lookupCode.slice(0, 30)}...`);

    let res: Response;
    try {
      res = await fetch(`${ASL_BELGISI_BASE}/public/api/cod/public/codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ codes: [lookupCode], addCodeHistory: false }),
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
