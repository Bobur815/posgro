import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, LoginResponse } from './types/auth.types';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { storeId, phone, password } = loginDto;

    // Find user by phone within the store scope (or global for SUPER_ADMIN)
    const user = await this.usersService.findByPhoneAndStore(phone, storeId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // SUPER_ADMIN doesn't need storeId, but regular users do
    if (user.role !== UserRole.SUPER_ADMIN && !user.storeId) {
      throw new UnauthorizedException('User is not assigned to any store');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      storeId: user.storeId,
      phone: user.phone,
      role: user.role,
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

  async validateUser(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.active) {
      return null;
    }
    // Attach storeId from token to user object for easy access
    return { ...user, storeId: payload.storeId };
  }
}
