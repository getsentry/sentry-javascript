import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { TraceInitiatorController } from './trace-initiator.controller';
import { TraceInitiatorService } from './trace-initiator.service';

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [TraceInitiatorController],
  providers: [TraceInitiatorService],
})
export class TraceInitiatorModule {}
