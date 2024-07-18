import { Module } from '@nestjs/common';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';
import { TraceInitiatorController } from './trace-initiator.controller';
import { TraceInitiatorService } from './trace-initiator.service';

@Module({
  imports: [SentryIntegrationModule.forRoot()],
  controllers: [TraceInitiatorController],
  providers: [TraceInitiatorService],
})
export class TraceInitiatorModule {}
