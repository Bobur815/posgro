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

  // The profile — password, names, role, active — comes only with a user the terminal created or
  // edited itself. The server owns everyone else's; see UsersService.upsertBulk.

  @ApiPropertyOptional({ description: 'Pre-hashed bcrypt password' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  @ApiPropertyOptional({ example: 'Ism Familiya' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameUz?: string;

  @ApiPropertyOptional({ example: 'Имя Фамилия' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameRu?: string;

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
