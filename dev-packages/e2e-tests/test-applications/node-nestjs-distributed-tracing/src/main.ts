// Import this first
import './instrument';

// Import other modules
import { BaseExceptionFilter, HttpAdapterHost, NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { TraceInitiatorModule } from './trace-initiator.module';
import { TraceReceiverModule } from './trace-receiver.module';

const TRACE_INITIATOR_PORT = 3030;
const TRACE_RECEIVER_PORT = 3040;

async function bootstrap() {
  const trace_initiator_app = await NestFactory.create(TraceInitiatorModule);
  const { httpAdapter } = trace_initiator_app.get(HttpAdapterHost);
  Sentry.setupNestErrorHandler(trace_initiator_app, new BaseExceptionFilter(httpAdapter));
  await trace_initiator_app.listen(TRACE_INITIATOR_PORT);

  const trace_receiver_app = await NestFactory.create(TraceReceiverModule);
  await trace_receiver_app.listen(TRACE_RECEIVER_PORT);
}

bootstrap();
