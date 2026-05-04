import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';

export class LogEntryDto {
  @IsString()
  ts!: string;

  @IsIn(['info', 'warn', 'error'])
  level!: string;

  @IsString()
  msg!: string;
}

export class UploadLogsDto {
  @IsString()
  terminalId!: string;

  @IsString()
  storeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogEntryDto)
  entries!: LogEntryDto[];
}
