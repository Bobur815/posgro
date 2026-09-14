import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { diskStorage } = require('multer') as { diskStorage: (opts: any) => any };
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsBoolean,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DownloadsService, DOWNLOAD_CATEGORIES, normalizeSlug } from './downloads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface MulterFile {
  originalname: string;
  mimetype: string;
  filename: string;
  size: number;
}

/**
 * What a super admin may upload.
 *
 * An allow-list, never a deny-list: this writes a file into a directory nginx serves to the
 * public, so anything not named here must be impossible, not merely discouraged.
 */
const ALLOWED_EXTENSIONS = ['.exe', '.msi', '.zip', '.rar', '.7z', '.pdf'];

/** 512 MB. nginx must allow at least this on the upload route or the request dies before Nest. */
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

function uploadDir(): string {
  const dir = process.env.DOWNLOADS_DIR || join(process.cwd(), 'downloads');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

class CreateDownloadDto {
  @IsOptional() @IsString() @MaxLength(64) slug?: string;
  @IsString() @MaxLength(120) titleRu!: string;
  @IsString() @MaxLength(120) titleUz!: string;
  @IsOptional() @IsString() @MaxLength(1000) descRu?: string;
  @IsOptional() @IsString() @MaxLength(1000) descUz?: string;
  @IsIn(DOWNLOAD_CATEGORIES as readonly string[]) category!: string;
  @IsOptional() @IsString() @MaxLength(40) version?: string;
  // multipart sends everything as text, so these need coercing before validation.
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @Type(() => Boolean) @IsBoolean() published?: boolean;
}

class UpdateDownloadDto {
  @IsOptional() @IsString() @MaxLength(120) titleRu?: string;
  @IsOptional() @IsString() @MaxLength(120) titleUz?: string;
  @IsOptional() @IsString() @MaxLength(1000) descRu?: string;
  @IsOptional() @IsString() @MaxLength(1000) descUz?: string;
  @IsOptional() @IsIn(DOWNLOAD_CATEGORIES as readonly string[]) category?: string;
  @IsOptional() @IsString() @MaxLength(40) version?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() published?: boolean;
}

@ApiTags('downloads')
@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  /**
   * Public, because panel.posgro.uz is a public page fetching this cross-origin with no
   * credential. It lists only published rows, and nothing in them is not meant to be read by
   * anyone who can reach the portal.
   */
  @Get()
  @ApiOperation({ summary: 'List published downloads (public)' })
  list(): Promise<unknown[]> {
    return this.downloads.list();
  }

  /** The POSGRO installer, read from the updater's own feed rather than stored twice. */
  @Get('latest-app')
  @ApiOperation({ summary: 'Current POSGRO installer version and size (public)' })
  latestApp() {
    return this.downloads.latestApp();
  }

  /**
   * Counts the download, then redirects to the file nginx serves.
   *
   * A redirect rather than streaming the bytes through Node: these are installers of hundreds of
   * megabytes, and nginx serves a static file far better than the API event loop can.
   */
  @Get(':slug/get')
  @ApiOperation({ summary: 'Count a download and redirect to the file (public)' })
  async download(@Param('slug') slug: string, @Res() res: any): Promise<void> {
    const item = await this.downloads.bySlug(slug);
    if (!item) throw new NotFoundException('Download not found');
    await this.downloads.countDownload(slug);
    res.redirect(302, item.filePath);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all downloads including unpublished (super admin only)' })
  listAll(): Promise<unknown[]> {
    return this.downloads.listAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir()),
        filename: (_req: any, file: any, cb: any) => {
          // Never the client's own name: it reaches a public directory, and a caller-controlled
          // filename there is a path-traversal and overwrite problem in one.
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${normalizeSlug(file.originalname)}-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req: any, file: any, cb: any) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new BadRequestException(`File type ${ext || '(none)'} is not allowed`), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a driver, tool or manual (super admin only)' })
  create(@UploadedFile() file: MulterFile, @Body() dto: CreateDownloadDto): Promise<unknown> {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.downloads.create({
      ...dto,
      slug: dto.slug || file.originalname,
      fileName: file.filename,
      filePath: `/downloads/${file.filename}`,
      fileSize: file.size,
      mimeType: file.mimetype,
    });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit a download’s metadata (super admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateDownloadDto): Promise<unknown> {
    return this.downloads.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a download and its file (super admin only)' })
  remove(@Param('id') id: string): Promise<{ id: string }> {
    return this.downloads.remove(id);
  }
}
