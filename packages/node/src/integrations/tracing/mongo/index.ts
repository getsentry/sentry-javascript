import { MongoDBInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Mongo' as const;

export const instrumentMongo = generateInstrumentOnce(INTEGRATION_NAME, () => new MongoDBInstrumentation());
