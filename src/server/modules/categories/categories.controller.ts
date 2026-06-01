import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { UserRole } from '@prisma/client';
import { IsString } from 'class-validator';

class CategoryDto {
  @IsString() nameRu!: string;
  @IsString() nameUz!: string;
  mxikGroupCode?: string | null;
}

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all categories for the store' })
  async findAll(@CurrentStore() storeId: string) {
    return this.categoriesService.findAll(storeId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create category (Admin only)' })
  async create(@CurrentStore() storeId: string, @Body() body: CategoryDto) {
    return this.categoriesService.create(storeId, body);
  }

  @Post('sync-bulk')
  @ApiOperation({ summary: 'Bulk upsert categories from POS terminal' })
  async syncBulk(@CurrentStore() storeId: string, @Body() body: { categories: any[] }) {
    return this.categoriesService.syncBulk(storeId, body.categories ?? []);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update category (Admin only)' })
  async update(
    @CurrentStore() storeId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CategoryDto>,
  ) {
    return this.categoriesService.update(id, storeId, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete category (Admin only)' })
  async remove(@CurrentStore() storeId: string, @Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id, storeId);
  }
}
