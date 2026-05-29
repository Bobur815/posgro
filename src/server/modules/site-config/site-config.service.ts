import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LoginBanner {
  imageUrl: string;
  title: string;
  subtitle: string;
}

export interface SubscriptionPlanPrices {
  starter: number;
  pro: number;
  vip: number;
}

const BANNER_KEY = 'login_banner';
const DEFAULT: LoginBanner = { imageUrl: '', title: '', subtitle: '' };
const DEFAULT_PRICES: SubscriptionPlanPrices = { starter: 0, pro: 0, vip: 0 };

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

  async getSubscriptionPlans(): Promise<SubscriptionPlanPrices> {
    const rows = await this.prisma.siteConfig.findMany({
      where: { key: { in: ['subscription_price_starter', 'subscription_price_pro', 'subscription_price_vip'] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
    return {
      starter: map['subscription_price_starter'] ?? DEFAULT_PRICES.starter,
      pro: map['subscription_price_pro'] ?? DEFAULT_PRICES.pro,
      vip: map['subscription_price_vip'] ?? DEFAULT_PRICES.vip,
    };
  }

  async setSubscriptionPlans(prices: SubscriptionPlanPrices): Promise<SubscriptionPlanPrices> {
    const entries: Array<{ key: string; value: string }> = [
      { key: 'subscription_price_starter', value: String(Math.round(prices.starter)) },
      { key: 'subscription_price_pro', value: String(Math.round(prices.pro)) },
      { key: 'subscription_price_vip', value: String(Math.round(prices.vip)) },
    ];
    await Promise.all(
      entries.map((e) =>
        this.prisma.siteConfig.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: { key: e.key, value: e.value },
        }),
      ),
    );
    return prices;
  }
}
