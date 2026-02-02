import { IsString, IsOptional, MinLength, IsEnum, IsBoolean } from 'class-validator';

enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  nameUz?: string;

  @IsOptional()
  @IsString()
  nameRu?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
