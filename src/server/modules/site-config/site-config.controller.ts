import { Controller, Get, Put, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { diskStorage } = require('multer') as { diskStorage: (opts: any) => any };
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { SiteConfigService, LoginBanner } from './site-config.service';
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

@ApiTags('site-config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Get('login-banner')
  @ApiOperation({ summary: 'Get login page right-panel banner (public)' })
  getLoginBanner(): Promise<LoginBanner> {
    return this.siteConfigService.getLoginBanner();
  }

  @Put('login-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update login page banner (super admin only)' })
  setLoginBanner(@Body() dto: LoginBannerDto): Promise<LoginBanner> {
    return this.siteConfigService.setLoginBanner(dto);
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
