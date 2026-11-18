import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  defaultIntegrations: false,
});

const customScope = new Sentry.Scope();
customScope.setClient(client);
customScope.update({ user: { username: 'h4cktor' } });

async function run(): Promise<void> {
  Sentry.logger.info('test info', { foo: 'bar1' }, { scope: customScope });
  Sentry.logger.info('test info with %d', [1], { foo: 'bar2' }, { scope: customScope });
  Sentry.logger.info(Sentry.logger.fmt`test info with fmt ${1}`, { foo: 'bar3' }, { scope: customScope });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
