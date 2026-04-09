import { IsString, IsInt, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HeartbeatDto {
  @ApiProperty({ example: 'T1', description: 'Terminal identifier' })
  @IsString()
  terminalId!: string;

  @ApiProperty({ example: '1234', description: 'Store ID' })
  @IsString()
  storeId!: string;

  @ApiProperty({ example: 3, description: 'Number of sales not yet synced to VPS' })
  @IsInt()
  @Min(0)
  unsyncedCount!: number;

  @ApiProperty({ example: '2026-04-07T10:00:00.000Z', description: 'Timestamp of last successful sync' })
  @IsDateString()
  lastSyncAt!: string;
}
