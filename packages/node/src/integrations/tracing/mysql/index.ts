import { MySQLInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

const INTEGRATION_NAME = 'Mysql' as const;

export const instrumentMysql = generateInstrumentOnce(INTEGRATION_NAME, () => new MySQLInstrumentation({}));
