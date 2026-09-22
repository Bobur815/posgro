import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { LicensesService, MAX_CLAIMED_TERMINALS, terminalClaim } from './licenses.service';

class RenewLicenseDto {
  @IsString()
  @MaxLength(4096)
  license!: string;

  /** The till asking. A till from before terminal limits sends none, and is signed as it was. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  terminalId?: string;

  /** A main's paired satellites, which never reach this server themselves. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CLAIMED_TERMINALS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  satellites?: string[];
}

@ApiTags('licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  /** No sign-in: the license presented is the credential (LicensesService.renew). */
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a store license this server signed for a fresh one' })
  async renew(@Body() dto: RenewLicenseDto): Promise<{ license: string }> {
    return {
      license: await this.licenses.renew(dto.license, terminalClaim(dto.terminalId, dto.satellites)),
    };
  }
}
