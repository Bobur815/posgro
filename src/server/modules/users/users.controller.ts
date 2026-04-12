import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Put,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { USER_ROLES } from '@shared/constants';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, StoreGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Get all users for the store (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(@CurrentStore() storeId: string) {
    return this.usersService.findAll(storeId);
  }

  @Get('sync')
  @Roles(USER_ROLES.ADMIN, USER_ROLES.USER)
  @ApiOperation({ summary: 'Get all users with password hashes for terminal sync' })
  @ApiResponse({ status: 200, description: 'List of users with credentials' })
  async findAllForSync(@CurrentStore() storeId: string) {
    return this.usersService.findAllForSync(storeId);
  }

  @Get(':id')
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Create new user for the store (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  async create(@CurrentStore() storeId: string, @Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto, storeId);
  }

  @Patch(':id')
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Update user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @CurrentStore() storeId: string,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto, storeId);
  }

  @Put(':id/activate')
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Activate user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User activated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async activate(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.usersService.activate(id, storeId);
  }

  @Delete(':id')
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Deactivate user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.usersService.deactivate(id, storeId);
  }

  @Delete(':id/delete')
  @Roles(USER_ROLES.ADMIN)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.usersService.delete(id, storeId);
  }
}
