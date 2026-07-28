import { GenericPoolInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'GenericPool' as const;

export const instrumentGenericPool = generateInstrumentOnce(INTEGRATION_NAME, () => new GenericPoolInstrumentation({}));
