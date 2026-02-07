import { IsString, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_ROLES, UserRole } from '@shared/constants';

export class CreateUserDto {
  @ApiProperty({ example: '+998901234567', description: 'Phone number (unique)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  phone!: string;

  @ApiProperty({ example: '123456', description: 'Password (min 6 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Ism Familiya', description: 'Name in Uzbek' })
  @IsString()
  @IsNotEmpty()
  nameUz!: string;

  @ApiProperty({ example: 'Имя Фамилия', description: 'Name in Russian' })
  @IsString()
  @IsNotEmpty()
  nameRu!: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: USER_ROLES.USER, description: 'User role' })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;
}
