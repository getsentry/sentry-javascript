// Import this first
import './instrument';

// Import other modules
import { NestFactory } from '@nestjs/core';
import { EventsModule } from './events.module';
import { TraceInitiatorModule } from './trace-initiator.module';
import { TraceReceiverModule } from './trace-receiver.module';

const TRACE_INITIATOR_PORT = 3030;
const TRACE_RECEIVER_PORT = 3040;
const EVENTS_PORT = 3050;

async function bootstrap() {
  const trace_initiator_app = await NestFactory.create(TraceInitiatorModule);
  await trace_initiator_app.listen(TRACE_INITIATOR_PORT);

  const trace_receiver_app = await NestFactory.create(TraceReceiverModule);
  await trace_receiver_app.listen(TRACE_RECEIVER_PORT);

  const events_app = await NestFactory.create(EventsModule);
  await events_app.listen(EVENTS_PORT);
}

bootstrap();
