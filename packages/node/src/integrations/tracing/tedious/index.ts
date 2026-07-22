import { TediousInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Tedious' as const;

export const instrumentTedious = generateInstrumentOnce(INTEGRATION_NAME, () => new TediousInstrumentation({}));
