import { Module } from '@nestjs/common';
import { TraceInitiatorController } from './trace-initiator.controller';
import { TraceInitiatorService } from './trace-initiator.service';

@Module({
  imports: [],
  controllers: [TraceInitiatorController],
  providers: [TraceInitiatorService],
})
export class TraceInitiatorModule {}
