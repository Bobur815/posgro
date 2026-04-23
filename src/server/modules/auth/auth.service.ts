import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, LoginResponse } from './types/auth.types';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string): Promise<LoginResponse> {
    const { storeId, phone, password } = loginDto;

    const user = await this.usersService.findByPhoneAndStore(phone, storeId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.role !== UserRole.SUPER_ADMIN && !user.storeId) {
      throw new UnauthorizedException('User is not assigned to any store');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.prisma.userSession.create({
      data: { userId: user.id, userAgent, ipAddress },
    });

    const payload: JwtPayload = {
      sub: user.id,
      storeId: user.storeId,
      phone: user.phone,
      role: user.role,
      sessionId: session.id,
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        storeId: user.storeId,
        phone: user.phone,
        role: user.role,
        nameUz: user.nameUz,
        nameRu: user.nameRu,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('invalid_password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    return { success: true };
  }

  async validateUser(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.active) {
      return null;
    }

    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session || session.isRevoked) {
        return null;
      }
    }

    return { ...user, storeId: payload.storeId, sessionId: payload.sessionId };
  }

  async getSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new UnauthorizedException('Session not found');
    }
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    return { success: true };
  }

  async revokeOtherSessions(currentSessionId: string, userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, isRevoked: false, id: { not: currentSessionId } },
      data: { isRevoked: true },
    });
    return { success: true };
  }
}
