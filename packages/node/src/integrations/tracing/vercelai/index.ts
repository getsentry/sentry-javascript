import { generateInstrumentOnce } from '../../../otel/instrument';
import { INTEGRATION_NAME } from './constants';
import { SentryVercelAiInstrumentation } from './instrumentation';

export const instrumentVercelAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryVercelAiInstrumentation({}));
