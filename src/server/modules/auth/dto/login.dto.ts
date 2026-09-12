import { IsString, IsNotEmpty, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({ example: 'store-123', description: 'Store ID (required for non-super-admin)' })
  @IsString()
  @IsOptional()
  storeId?: string;

  /**
   * Without `storeId`: the store to open first, if this person's password opens it — the one the
   * browser last worked in. Otherwise the first by name. Never a way in by itself.
   */
  @ApiPropertyOptional({ example: 'store-123', description: 'Store to open first, when no storeId is given' })
  @IsString()
  @IsOptional()
  preferredStoreId?: string;

  @ApiProperty({ example: 'admin', description: 'User phone number' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'admin123', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  /**
   * Which client is signing in. Only affects the OFFLINE_ONLY refusal, which is a dashboard rule:
   * such a store's data lives on its own terminal, so browsing it here would show a stale shop.
   * A POS terminal still needs a credential for the vendor's shared services, so it says so.
   * Omitted means 'dashboard' — the stricter rule, which is the right default for a missing field.
   */
  @ApiPropertyOptional({ example: 'pos', enum: ['dashboard', 'pos'], description: 'Calling client' })
  @IsIn(['dashboard', 'pos'])
  @IsOptional()
  client?: 'dashboard' | 'pos';
}
