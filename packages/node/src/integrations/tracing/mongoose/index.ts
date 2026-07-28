import { MongooseInstrumentation } from './vendored/mongoose';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Mongoose' as const;

export const instrumentMongoose = generateInstrumentOnce(INTEGRATION_NAME, () => new MongooseInstrumentation());
