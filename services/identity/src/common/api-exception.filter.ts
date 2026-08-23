import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiException } from './api.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const response = context.getResponse<FastifyReply>();
    const correlationId = request.headers['x-correlation-id']?.toString() ?? 'unknown';
    const apiError = exception instanceof ApiException ? exception : undefined;
    const status =
      apiError?.getStatus() ??
      (exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR);
    const payload = apiError?.getResponse() as
      { code?: string; message?: string; details?: unknown[] } | undefined;

    response.status(status).send({
      code: payload?.code ?? 'INTERNAL_ERROR',
      message: payload?.message ?? 'An unexpected error occurred.',
      correlationId,
      details: payload?.details ?? [],
    });
  }
}
