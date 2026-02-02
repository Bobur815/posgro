import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily')
  async getDailyAnalytics(@Query('date') date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    return this.analyticsService.getDailyAnalytics(targetDate);
  }

  @Get('monthly')
  async getMonthlyAnalytics(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) : new Date().getMonth();
    return this.analyticsService.getMonthlyAnalytics(targetYear, targetMonth);
  }

  @Get('product-performance')
  async getProductPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    return this.analyticsService.getProductPerformance(start, end);
  }
}
