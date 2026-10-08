import type { HealthResponse } from '@equa/contracts';
import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Controller('health')
export class HealthController {
  @Get()
  health(
    @Headers('origin') requestOrigin: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): HealthResponse {
    const allowedOrigin = healthCorsOrigin(requestOrigin, process.env.APP_WEB_URL);
    if (allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', allowedOrigin);
      reply.header('Vary', 'Origin');
    }
    return { status: 'ok', service: 'identity', timestamp: new Date().toISOString() };
  }
}

function healthCorsOrigin(
  requestOrigin: string | undefined,
  appWebUrl: string | undefined,
): string | undefined {
  if (!requestOrigin || !appWebUrl) return undefined;
  try {
    const allowedOrigin = new URL(appWebUrl).origin;
    return new URL(requestOrigin).origin === allowedOrigin ? allowedOrigin : undefined;
  } catch {
    return undefined;
  }
}
