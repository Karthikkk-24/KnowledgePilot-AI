import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { INGESTION_QUEUE } from '../ingestion/ingestion.constants';
import { EVAL_QUEUE } from './eval.constants';
import { EvalController } from './eval.controller';
import { EvalProcessor } from './eval.processor';
import { EvalService } from './eval.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: EVAL_QUEUE }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
  ],
  controllers: [EvalController],
  providers: [EvalService, EvalProcessor],
})
export class EvalModule {}
