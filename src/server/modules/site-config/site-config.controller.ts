import { Controller, Get, Put, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsArray,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SUBSCRIPTION_RULE_LIMITS as LIMITS,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';
import {
  LANDING_PLAN_IDS,
  type LandingPlanId,
  type LandingPlan,
  type LandingContact,
} from '../../../shared/types/landing.types';
import { FileInterceptor } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { diskStorage } = require('multer') as { diskStorage: (opts: any) => any };
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import {
  SiteConfigService,
  LoginBanner,
  SubscriptionPlanPrices,
  SubscriptionPayment,
} from './site-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  filename: string;
  size: number;
  path?: string;
}

class LoginBannerDto {
  @IsString() imageUrl!: string;
  @IsString() title!: string;
  @IsString() subtitle!: string;
}

class SubscriptionPlanPricesDto {
  @IsNumber() @Min(0) starter!: number;
  @IsNumber() @Min(0) pro!: number;
  @IsNumber() @Min(0) vip!: number;
}

class SubscriptionPaymentDto {
  @IsString() qrPayload!: string;
  @IsString() paymentUrl!: string;
  @IsString() supportPhone!: string;
}

/**
 * Landing-page DTOs.
 *
 * Nested arrays need @ValidateNested + @Type or the global pipe's `whitelist` lets unvalidated
 * objects through untouched. They are validated here for a useful 400, and normalized again in
 * the service — which is the guard that actually matters, since the same rows can be written by
 * an older client or edited by hand.
 */
class LandingPlanDto {
  @IsIn(LANDING_PLAN_IDS as readonly string[]) id!: LandingPlanId;
  @IsString() nameRu!: string;
  @IsString() nameUz!: string;
  @IsString() taglineRu!: string;
  @IsString() taglineUz!: string;
  @IsArray() @IsString({ each: true }) featuresRu!: string[];
  @IsArray() @IsString({ each: true }) featuresUz!: string[];
  @IsBoolean() highlighted!: boolean;
  @IsInt() order!: number;
  @IsOptional() @IsString() ctaUrl?: string;
}

class LandingPlansDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LandingPlanDto)
  plans!: LandingPlanDto[];
}

class LandingPhoneDto {
  @IsString() label!: string;
  @IsString() number!: string;
}

class LandingSocialDto {
  /** Free string, not an enum — a new network is added from the dashboard, without a release. */
  @IsString() platform!: string;
  @IsString() url!: string;
  @IsInt() order!: number;
}

class LandingContactDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LandingPhoneDto) phones!: LandingPhoneDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => LandingSocialDto) socials!: LandingSocialDto[];
  @IsString() email!: string;
  @IsString() addressRu!: string;
  @IsString() addressUz!: string;
  @IsString() workingHoursRu!: string;
  @IsString() workingHoursUz!: string;
}

class SubscriptionRulesDto implements SubscriptionRules {
  @IsBoolean() trialEnabled!: boolean;
  @IsInt() @Min(LIMITS.trialDays.min) @Max(LIMITS.trialDays.max) trialDays!: number;
  @IsInt() @Min(LIMITS.warnDays.min) @Max(LIMITS.warnDays.max) warnDays!: number;
  @IsInt() @Min(LIMITS.graceDays.min) @Max(LIMITS.graceDays.max) graceDays!: number;
  @IsInt()
  @Min(LIMITS.offlineCheckinDays.min)
  @Max(LIMITS.offlineCheckinDays.max)
  offlineCheckinDays!: number;
}

@ApiTags('site-config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Get('login-banner')
  @ApiOperation({ summary: 'Get the POS terminal login screen banner (public)' })
  getLoginBanner(): Promise<LoginBanner> {
    return this.siteConfigService.getLoginBanner();
  }

  @Put('login-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update the POS terminal login screen banner (super admin only)' })
  setLoginBanner(@Body() dto: LoginBannerDto): Promise<LoginBanner> {
    return this.siteConfigService.setLoginBanner(dto);
  }

  @Get('web-login-banner')
  @ApiOperation({ summary: 'Get the web dashboard login page banner (public)' })
  getWebLoginBanner(): Promise<LoginBanner> {
    return this.siteConfigService.getWebLoginBanner();
  }

  @Put('web-login-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update the web dashboard login page banner (super admin only)' })
  setWebLoginBanner(@Body() dto: LoginBannerDto): Promise<LoginBanner> {
    return this.siteConfigService.setWebLoginBanner(dto);
  }

  @Get('subscription-plans')
  @ApiOperation({ summary: 'Get subscription plan prices (public)' })
  getSubscriptionPlans(): Promise<SubscriptionPlanPrices> {
    return this.siteConfigService.getSubscriptionPlans();
  }

  @Put('subscription-plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set subscription plan prices (super admin only)' })
  setSubscriptionPlans(@Body() dto: SubscriptionPlanPricesDto): Promise<SubscriptionPlanPrices> {
    return this.siteConfigService.setSubscriptionPlans(dto);
  }

  @Get('subscription-payment')
  @ApiOperation({ summary: 'Get subscription payment details — QR payload and pay link (public)' })
  getSubscriptionPayment(): Promise<SubscriptionPayment> {
    return this.siteConfigService.getSubscriptionPayment();
  }

  @Put('subscription-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set subscription payment details (super admin only)' })
  setSubscriptionPayment(@Body() dto: SubscriptionPaymentDto): Promise<SubscriptionPayment> {
    return this.siteConfigService.setSubscriptionPayment(dto);
  }

  @Get('subscription-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get trial, warning, grace and check-in days (super admin only)' })
  getSubscriptionRules(): Promise<SubscriptionRules> {
    return this.siteConfigService.getSubscriptionRules();
  }

  @Put('subscription-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set trial, warning, grace and check-in days (super admin only)' })
  setSubscriptionRules(@Body() dto: SubscriptionRulesDto): Promise<SubscriptionRules> {
    return this.siteConfigService.setSubscriptionRules(dto);
  }

  /**
   * Landing-page content (tasks/DOMAIN_MIGRATION_POSGRO.md §9.1).
   *
   * The GETs are public because posgro.uz is a static page fetching them cross-origin, with no
   * credential to present — the same footing as the login banner. Nothing here is sensitive: it
   * is the copy printed on a public marketing page.
   *
   * Prices are NOT here. They come from `subscription-plans` above, which is the key the
   * subscription system bills from.
   */
  @Get('landing-plans')
  @ApiOperation({ summary: 'Get how the three tiers are presented on the landing page (public)' })
  getLandingPlans(): Promise<LandingPlan[]> {
    return this.siteConfigService.getLandingPlans();
  }

  @Put('landing-plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set landing page tier presentation (super admin only)' })
  setLandingPlans(@Body() dto: LandingPlansDto): Promise<LandingPlan[]> {
    return this.siteConfigService.setLandingPlans(dto.plans);
  }

  @Get('landing-contact')
  @ApiOperation({ summary: 'Get landing page phone numbers and social links (public)' })
  getLandingContact(): Promise<LandingContact> {
    return this.siteConfigService.getLandingContact();
  }

  @Put('landing-contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set landing page contact details (super admin only)' })
  setLandingContact(@Body() dto: LandingContactDto): Promise<LandingContact> {
    return this.siteConfigService.setLandingContact(dto);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload a banner image (super admin only)' })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req: any, _file: any, cb: (err: any, dest: string) => void) => {
        const dest = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
        if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
        cb(null, dest);
      },
      filename: (_req: any, file: any, cb: (err: any, name: string) => void) => {
        cb(null, `banner-${Date.now()}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (_req: any, file: any, cb: (err: any, accept: boolean) => void) => {
      if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
        return cb(new BadRequestException('Only image files are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  uploadImage(@UploadedFile() file: UploadedFile): { url: string } {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: `/uploads/${file.filename}` };
  }
}
