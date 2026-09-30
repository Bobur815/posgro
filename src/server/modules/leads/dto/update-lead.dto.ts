import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ example: 'Qayta qo‘ng‘iroq — ertaga 10:00' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListLeadsQueryDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;
}
