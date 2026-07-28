import { MySQL2Instrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Mysql2' as const;

export const instrumentMysql2 = generateInstrumentOnce(INTEGRATION_NAME, () => new MySQL2Instrumentation());
