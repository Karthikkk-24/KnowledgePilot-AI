import { Module } from '@nestjs/common';
import { EvalModule } from '../eval/eval.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [EvalModule],
  controllers: [LabController],
  providers: [LabService],
})
export class LabModule {}
