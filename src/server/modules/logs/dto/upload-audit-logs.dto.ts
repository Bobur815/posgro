import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AuditLogEntryDto {
  @IsString()
  id!: string;

  @IsString()
  userId!: string;

  @IsString()
  phone!: string;

  @IsString()
  action!: string;

  @IsString()
  entity!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsString()
  createdAt!: string;
}

export class UploadAuditLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditLogEntryDto)
  entries!: AuditLogEntryDto[];
}
