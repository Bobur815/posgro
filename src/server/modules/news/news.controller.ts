import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AllowWhenBlocked } from "../../common/decorators/allow-when-blocked.decorator";
import {
  NewsService,
  type NewsAdminRow,
  type NewsArticle,
  type NewsPage,
  type NewsSummary,
} from "./news.service";
import { CreateNewsDto, ListNewsQueryDto, UpdateNewsDto } from "./dto/news.dto";

/** Multer's memory-storage file; sharp re-encodes it before anything touches the disk. */
interface MemoryFile {
  mimetype: string;
  buffer: Buffer;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Readers are off unless NEWS_ENABLED=true, so a half-written first post never goes public. The
 * super admin routes work regardless — posts can be prepared before the switch is flipped.
 */
function assertEnabled(): void {
  if (process.env.NEWS_ENABLED !== "true") throw new NotFoundException();
}

@ApiTags("news")
@Controller("news")
export class NewsController {
  constructor(private readonly news: NewsService) {}

  // ─── Super admin — declared before `:slug` so these paths are not read as slugs ──

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "All posts, drafts included, last edited first (super admin only)",
  })
  adminList(): Promise<NewsAdminRow[]> {
    return this.news.adminList();
  }

  @Get("admin/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "One post with its body, for the editor (super admin only)",
  })
  adminGet(@Param("id") id: string): ReturnType<NewsService["adminGet"]> {
    return this.news.adminGet(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Create a post (super admin only)" })
  create(
    @Body() dto: CreateNewsDto,
    @CurrentUser("id") userId: string,
  ): Promise<NewsArticle> {
    return this.news.create(dto, userId);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Edit, publish or unpublish a post (super admin only)",
  })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentUser("id") userId: string,
  ): Promise<NewsArticle> {
    return this.news.update(id, dto, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Delete a post (super admin only)" })
  remove(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<{ removed: true }> {
    return this.news.remove(id, userId);
  }

  @Post("upload-image")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Upload a cover or body image → WebP ≤1600px (super admin only)",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (
        _req: unknown,
        file: MemoryFile,
        cb: (err: Error | null, accept: boolean) => void,
      ) => {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
          return cb(
            new BadRequestException("JPEG, PNG, WebP or GIF only"),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @UploadedFile() file: MemoryFile | undefined,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.news.saveImage(file.buffer);
  }

  // ─── Signed-in readers (dashboard): public posts and customers-only ones ──

  @Get("feed")
  @UseGuards(JwtAuthGuard)
  @AllowWhenBlocked()
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Published posts for signed-in users, newest first",
  })
  feed(@Query() query: ListNewsQueryDto): Promise<NewsPage<NewsSummary>> {
    assertEnabled();
    return this.news.list(query, ["PUBLIC", "CUSTOMERS"]);
  }

  @Get("feed/:slug")
  @UseGuards(JwtAuthGuard)
  @AllowWhenBlocked()
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "One published post for signed-in users" })
  feedArticle(@Param("slug") slug: string): Promise<NewsArticle> {
    assertEnabled();
    return this.news.article(slug, ["PUBLIC", "CUSTOMERS"]);
  }

  // ─── Public (posgro.uz) ──

  @Get()
  @ApiOperation({ summary: "Published public posts, newest first (public)" })
  list(@Query() query: ListNewsQueryDto): Promise<NewsPage<NewsSummary>> {
    assertEnabled();
    return this.news.list(query, ["PUBLIC"]);
  }

  @Get(":slug")
  @ApiOperation({ summary: "One published public post (public)" })
  article(@Param("slug") slug: string): Promise<NewsArticle> {
    assertEnabled();
    return this.news.article(slug, ["PUBLIC"]);
  }
}
