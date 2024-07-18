import { Module } from '@nestjs/common';
import { TraceInitiatorController } from './trace-initiator.controller';
import { TraceInitiatorService } from './trace-initiator.service';
import {SentryIntegrationModule} from "@sentry/nestjs/setup";

@Module({
  imports: [SentryIntegrationModule.forRoot()],
  controllers: [TraceInitiatorController],
  providers: [TraceInitiatorService],
})
export class TraceInitiatorModule {}
