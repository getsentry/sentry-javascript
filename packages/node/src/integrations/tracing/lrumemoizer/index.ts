import { LruMemoizerInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'LruMemoizer' as const;

export const instrumentLruMemoizer = generateInstrumentOnce(INTEGRATION_NAME, () => new LruMemoizerInstrumentation());
