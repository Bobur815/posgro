import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { LEAD_STORE_TYPES, type LeadStoreType } from '../../telegram/bot-commands';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLeadDto {
  @ApiProperty({ example: 'Aliyev Vali' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  /** The landing sends `+998` and nine digits; spaces and dashes are stripped before the check. */
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value,
  )
  @IsString()
  @Matches(/^\+998\d{9}$/)
  phone!: string;

  @ApiProperty({ example: 'Baraka market' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  storeName!: string;

  @ApiProperty({ enum: LEAD_STORE_TYPES })
  @IsIn(LEAD_STORE_TYPES)
  storeType!: LeadStoreType;

  @ApiPropertyOptional({ enum: ['uz', 'ru'] })
  @IsOptional()
  @IsIn(['uz', 'ru'])
  lang?: 'uz' | 'ru';

  /** Honeypot: hidden on the form, so only a bot fills it. */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  website?: string;
}
