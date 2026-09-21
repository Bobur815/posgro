import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { USER_ROLES, UserRole } from '@shared/constants';

export class SyncUserItemDto {
  @ApiProperty({ description: 'User ID from terminal' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ description: 'Pre-hashed bcrypt password' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ example: 'Ism Familiya' })
  @IsString()
  @IsNotEmpty()
  nameUz!: string;

  @ApiProperty({ example: 'Имя Фамилия' })
  @IsString()
  @IsNotEmpty()
  nameRu!: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: USER_ROLES.USER })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /**
   * Nasiya balance, as the terminal has it. The till is authoritative: a debt is taken on and
   * paid off at the counter, so this endpoint mirrors its figure rather than reconciling one.
   */
  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  debt?: number;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  debtDueDate?: string | null;
}

export class SyncUsersBulkDto {
  @ApiProperty({ type: [SyncUserItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncUserItemDto)
  users!: SyncUserItemDto[];
}
