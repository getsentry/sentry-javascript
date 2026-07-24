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
  // Should be dropped because logs are disabled.
  Sentry.logger.info('this log should not be captured', {}, { scope });

  // Should be delivered — used as a sentinel so the test has a deterministic
  // envelope to match instead of asserting on the absence of one.
  scope.captureException(new Error('sentinel_error'));

  await client.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
