import { Controller, Get } from '@nestjs/common';
import { ok } from '../../common/http';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return ok(this.healthService.getHealth());
  }

  @Get('ready')
  async getReady() {
    return ok(await this.healthService.getReady());
  }
}
