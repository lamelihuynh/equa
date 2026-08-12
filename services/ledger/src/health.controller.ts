import type { HealthResponse } from '@equa/contracts';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health(): HealthResponse {
    return { status: 'ok', service: 'ledger', timestamp: new Date().toISOString() };
  }
}
