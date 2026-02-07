import { IsString, IsOptional, MinLength, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { USER_ROLES, UserRole } from '@shared/constants';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'newpassword123', description: 'New password' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: 'Yangi Ism', description: 'Name in Uzbek' })
  @IsOptional()
  @IsString()
  nameUz?: string;

  @ApiPropertyOptional({ example: 'Новое Имя', description: 'Name in Russian' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ enum: USER_ROLES, description: 'User role' })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
