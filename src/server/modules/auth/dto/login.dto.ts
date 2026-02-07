import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({ example: 'store-123', description: 'Store ID (required for non-super-admin)' })
  @IsString()
  @IsOptional()
  storeId?: string;

  @ApiProperty({ example: 'admin', description: 'User phone number' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'admin123', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}
