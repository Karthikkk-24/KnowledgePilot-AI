import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { INGESTION_QUEUE } from './ingestion.constants';
import { IngestionProcessor } from './ingestion.processor';

@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE })],
  providers: [IngestionProcessor],
})
export class IngestionModule {}
