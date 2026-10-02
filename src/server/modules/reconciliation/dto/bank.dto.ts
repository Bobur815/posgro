import { IsDateString, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankDepositDto {
  /** A string, like every amount in this API: a JSON number would round som on the way in. */
  @ApiProperty({
    example: '15000000',
    description: 'Fiscalised cash taken to the bank, som',
  })
  @IsNumberString()
  amount!: string;

  @ApiPropertyOptional({
    example: '2026-10-01T10:00:00.000Z',
    description: 'Defaults to now',
  })
  @IsOptional()
  @IsDateString()
  depositedAt?: string;

  @ApiPropertyOptional({ example: 'Kapitalbank, kvitansiya 123' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SetBankStartDateDto {
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;
}
