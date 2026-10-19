import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return {
      data: this.healthService.getHealth(),
      error: null,
      meta: { requestId: 'phase0' },
    };
  }

  @Get('ready')
  getReady() {
    return {
      data: this.healthService.getReady(),
      error: null,
      meta: { requestId: 'phase0' },
    };
  }
}
