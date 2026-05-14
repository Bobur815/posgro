import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // We configure it manually below
  });

  // Increase body-parser limit for large product/sync payloads (default is 100kb)
  const express = await import('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Serve the super-admin web app from /web (built assets live in dist/web)
  const webDistPath = join(__dirname, '..', 'web');
  app.useStaticAssets(webDistPath, { prefix: '/web' });

  // Serve uploaded files (banner images, etc.)
  // Use UPLOADS_DIR so files persist across deploys (dist/ is wiped on each build)
  const uploadsPath = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(uploadsPath)) mkdirSync(uploadsPath, { recursive: true });
  app.useStaticAssets(uploadsPath, { prefix: '/uploads' });

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('POSGRO API')
    .setDescription('API for Grocery Store POS System - Sales, Products, Inventory, Users')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('products', 'Product management')
    .addTag('sales', 'Sales and sync')
    .addTag('inventory', 'Inventory management')
    .addTag('analytics', 'Reports and analytics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Health check endpoint (used by Docker/load balancer)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) => {
    res.json({ status: 'ok' });
  });

  // SPA fallback: /web/* routes that don't match a static file → index.html
  const webIndex = join(webDistPath, 'index.html');
  app.use('/web', (_req: any, res: any, next: any) => {
    res.sendFile(webIndex, (err: unknown) => { if (err) next(); });
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`Server running on http://localhost:${port}`);
  console.log(`Web admin:     http://localhost:${port}/web`);
  console.log(`Swagger docs:  http://localhost:${port}/docs`);
}

bootstrap();
