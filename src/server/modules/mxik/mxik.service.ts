import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

const TASNIF_BASE = 'https://tasnif.soliq.uz/api/cls-api';

interface MxikCodeResponse {
  success: boolean;
  data: {
    mxikCode: string;
    brandName: string | null;
    attributeNameUz: string | null;
    attributeNameRu: string | null;
    subPositionNameUz: string;
    subPositionNameRu: string;
    packageNames: Array<{ code: number; nameUz: string }>;
  } | null;
}

interface MxikSearchResponse {
  success: boolean;
  data: Array<{
    mxikCode: string;
    internationalCode: string;
  }> | null;
  recordTotal: number;
}

@Injectable()
export class MxikService {
  async getByCode(code: string): Promise<{ code: string; name: string; nameRu: string; packageCode: string }> {
    if (!/^\d{17}$/.test(code)) {
      throw new HttpException('Invalid MXIK code — must be 17 digits', HttpStatus.BAD_REQUEST);
    }

    let json: MxikCodeResponse;
    try {
      const res = await fetch(`${TASNIF_BASE}/integration-mxik/get/history/${code}`);
      json = await res.json() as MxikCodeResponse;
    } catch {
      throw new HttpException('MXIK service unavailable', HttpStatus.BAD_GATEWAY);
    }

    if (!json.success || !json.data) {
      throw new HttpException('MXIK code not found', HttpStatus.NOT_FOUND);
    }

    const d = json.data;
    const brand = d.brandName ? `${d.brandName} ` : '';
    return {
      code: d.mxikCode,
      name: brand + (d.attributeNameUz ?? d.subPositionNameUz),
      nameRu: brand + (d.attributeNameRu ?? d.subPositionNameRu),
      packageCode: String(d.packageNames?.[0]?.code ?? '796'),
    };
  }

  async searchByBarcode(barcode: string): Promise<{ code: string; name: string; nameRu: string; packageCode: string }> {
    let json: MxikSearchResponse;
    try {
      const url = `${TASNIF_BASE}/elasticsearch/search?lang=uz_cyrl&search=${encodeURIComponent(barcode)}&size=5&page=0`;
      const res = await fetch(url);
      json = await res.json() as MxikSearchResponse;
    } catch {
      throw new HttpException('MXIK service unavailable', HttpStatus.BAD_GATEWAY);
    }

    if (!json.success || !json.data?.length) {
      throw new HttpException('Product not found in MXIK registry', HttpStatus.NOT_FOUND);
    }

    const match = json.data.find((d) => d.internationalCode === barcode) ?? json.data[0];
    return this.getByCode(match.mxikCode);
  }
}
