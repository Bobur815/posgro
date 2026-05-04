import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LoginBanner {
  imageUrl: string;
  title: string;
  subtitle: string;
}

const BANNER_KEY = 'login_banner';
const DEFAULT: LoginBanner = { imageUrl: '', title: '', subtitle: '' };

@Injectable()
export class SiteConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getLoginBanner(): Promise<LoginBanner> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: BANNER_KEY } });
    if (!row) return DEFAULT;
    try {
      return JSON.parse(row.value) as LoginBanner;
    } catch {
      return DEFAULT;
    }
  }

  async setLoginBanner(banner: LoginBanner): Promise<LoginBanner> {
    await this.prisma.siteConfig.upsert({
      where: { key: BANNER_KEY },
      update: { value: JSON.stringify(banner) },
      create: { key: BANNER_KEY, value: JSON.stringify(banner) },
    });
    return banner;
  }
}
