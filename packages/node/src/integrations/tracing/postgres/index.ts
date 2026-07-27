import { PgInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

interface PostgresIntegrationOptions {
  ignoreConnectSpans?: boolean;
}

const INTEGRATION_NAME = 'Postgres' as const;

export const instrumentPostgres = generateInstrumentOnce(
  INTEGRATION_NAME,
  PgInstrumentation,
  (options?: PostgresIntegrationOptions) => ({
    ignoreConnectSpans: options?.ignoreConnectSpans ?? false,
  }),
);
