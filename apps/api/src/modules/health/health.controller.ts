import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ok } from '../../common/http';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  getHealth() {
    return ok(this.healthService.getHealth());
  }

  @Public()
  @Get('ready')
  async getReady() {
    return ok(await this.healthService.getReady());
  }
}
