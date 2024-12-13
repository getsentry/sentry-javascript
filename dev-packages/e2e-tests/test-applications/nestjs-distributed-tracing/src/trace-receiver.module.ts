import { Module } from '@nestjs/common';
import { TraceReceiverController } from './trace-receiver.controller';
import { TraceReceiverService } from './trace-receiver.service';

@Module({
  imports: [],
  controllers: [TraceReceiverController],
  providers: [TraceReceiverService],
})
export class TraceReceiverModule {}
