import { generateInstrumentOnce } from '../../../otel/instrument';
import { AmqplibInstrumentation } from './vendored/instrumentation';

const INTEGRATION_NAME = 'Amqplib' as const;

export const instrumentAmqplib = generateInstrumentOnce(INTEGRATION_NAME, () => new AmqplibInstrumentation());
