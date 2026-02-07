import { IsString, IsOptional, IsObject, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StoreSettingsDto } from './create-store.dto';

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'My Updated Store', description: 'Store name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '456 New Street, Samarkand', description: 'Store address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '+998907654321', description: 'Store phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the store is active' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: StoreSettingsDto, description: 'Store settings' })
  @IsOptional()
  @IsObject()
  settings?: StoreSettingsDto;
}
