import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from './types/auth.types';
import { User } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip;
    return this.authService.login(loginDto, userAgent, ipAddress);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'User logout' })
  async logout(@CurrentUser() user: User & { sessionId?: string }) {
    if (user.sessionId) {
      await this.authService.revokeSession(user.sessionId, user.id);
    }
    return { success: true };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @CurrentUser() user: User & { storeId: string | null },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: User & { storeId: string | null }): Promise<CurrentUserType> {
    return {
      id: user.id,
      storeId: user.storeId,
      phone: user.phone,
      role: user.role,
      nameUz: user.nameUz,
      nameRu: user.nameRu,
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List active sessions' })
  async getSessions(@CurrentUser() user: User & { sessionId?: string }) {
    const sessions = await this.authService.getSessions(user.id);
    return sessions.map((s) => ({ ...s, isCurrent: s.id === user.sessionId }));
  }

  @Patch('sessions/device-name')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set a name for all sessions from a given IP' })
  async nameDevice(
    @CurrentUser() user: User & { sessionId?: string },
    @Body() body: { ipAddress: string; name: string },
  ) {
    return this.authService.nameDevice(user.id, body.ipAddress, body.name);
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke all other sessions' })
  async revokeOtherSessions(@CurrentUser() user: User & { sessionId?: string }) {
    if (!user.sessionId) return { success: true };
    return this.authService.revokeOtherSessions(user.sessionId, user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke a session' })
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: User & { sessionId?: string },
  ) {
    return this.authService.revokeSession(sessionId, user.id);
  }
}
