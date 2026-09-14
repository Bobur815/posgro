import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchStoreDto {
  @ApiProperty({ example: 'store-123', description: 'One of the stores this sign-in may open' })
  @IsString()
  @IsNotEmpty()
  storeId!: string;
}
