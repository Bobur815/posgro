import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { LicensesService } from './licenses.service';

class RenewLicenseDto {
  @IsString()
  @MaxLength(4096)
  license!: string;
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
    return { license: await this.licenses.renew(dto.license) };
  }
}
