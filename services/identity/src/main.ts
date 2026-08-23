import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { CorrelationIdInterceptor } from './common/correlation-id.interceptor';

loadEnv({ path: join(process.cwd(), '../../.env'), quiet: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  await app.register(cookie as never);
  await app.register(
    multipart as never,
    { limits: { fileSize: 2 * 1024 * 1024, files: 1 } } as never,
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(app.get(CorrelationIdInterceptor));
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Equa Identity API').setVersion('v1').addBearerAuth().build(),
  );
  SwaggerModule.setup('v1/docs', app, document);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? process.env.IDENTITY_PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
