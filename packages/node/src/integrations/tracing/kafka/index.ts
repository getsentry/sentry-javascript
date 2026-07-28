import { KafkaJsInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Kafka' as const;

export const instrumentKafka = generateInstrumentOnce(INTEGRATION_NAME, () => new KafkaJsInstrumentation());
