import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
}

export class SyncUsersBulkDto {
  @ApiProperty({ type: [SyncUserItemDto] })
  users!: SyncUserItemDto[];
}
