import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const client = new Sentry.NodeClient({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  enableLogs: false,
  transport: loggingTransport,
  stackParser: Sentry.defaultStackParser,
  integrations: [],
});

const scope = new Sentry.Scope();
scope.setClient(client);
client.init();

async function run(): Promise<void> {
  Sentry.logger.info('this log should not be captured', {}, { scope });

  // Flush the log buffer before the sentinel is captured. If the disable path is
  // broken, the leaked log envelope is sent here and arrives before the error,
  // failing the ordered `event` expectation. If logs are correctly disabled,
  // the buffer is empty and only the sentinel error is delivered.
  await client.flush();

  scope.captureException(new Error('sentinel_error'));

  await client.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
