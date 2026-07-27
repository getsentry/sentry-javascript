import { generateInstrumentOnce } from '../../../otel/instrument';
import { FirebaseInstrumentation } from './otel';

const INTEGRATION_NAME = 'Firebase' as const;

export const instrumentFirebase = generateInstrumentOnce(INTEGRATION_NAME, () => new FirebaseInstrumentation());
