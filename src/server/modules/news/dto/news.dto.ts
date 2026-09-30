import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NEWS_IMAGE_URL } from "../news.blocks";

export const NEWS_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

export const NEWS_AUDIENCES = ["PUBLIC", "CUSTOMERS"] as const;
export type NewsAudience = (typeof NEWS_AUDIENCES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Empty string from a cleared input means "no value", which is null in the table. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;

export class CreateNewsDto {
  @ApiPropertyOptional({
    description: "URL segment; derived from titleUz when omitted",
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug: lowercase latin letters, digits, dashes",
  })
  @MaxLength(80)
  slug?: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleUz!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleRu!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  excerptUz?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  excerptRu?: string | null;

  @ApiPropertyOptional({ example: "/uploads/news/202609-ab12cd.webp" })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @Matches(NEWS_IMAGE_URL, {
    message: "coverUrl: upload through /news/upload-image",
  })
  coverUrl?: string | null;

  /** Checked block by block in NewsService (parseBlocks) — class-validator has no union types. */
  @ApiPropertyOptional({ type: "array", items: { type: "object" } })
  @IsOptional()
  @IsArray()
  body?: unknown[];

  @ApiPropertyOptional({ enum: NEWS_STATUSES })
  @IsOptional()
  @IsIn(NEWS_STATUSES)
  status?: NewsStatus;

  @ApiPropertyOptional({ enum: NEWS_AUDIENCES })
  @IsOptional()
  @IsIn(NEWS_AUDIENCES)
  audience?: NewsAudience;
}

/** Every field optional; `slug` is editable too (old links then 404 — the editor warns). */
export class UpdateNewsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug: lowercase latin letters, digits, dashes",
  })
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleUz?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleRu?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  excerptUz?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  excerptRu?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @Matches(NEWS_IMAGE_URL, {
    message: "coverUrl: upload through /news/upload-image",
  })
  coverUrl?: string | null;

  @IsOptional() @IsArray() body?: unknown[];
  @IsOptional() @IsIn(NEWS_STATUSES) status?: NewsStatus;
  @IsOptional() @IsIn(NEWS_AUDIENCES) audience?: NewsAudience;
}

export class ListNewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}
