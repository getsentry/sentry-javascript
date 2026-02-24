import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { consola } from 'consola';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  enableLogs: true,
  transport: loggingTransport,
});

async function run(): Promise<void> {
  consola.level = 5;

  const sentryReporter = Sentry.createConsolaReporter();
  consola.addReporter(sentryReporter);

  // --- Fallback (first arg is string): message = formatted(all args), sentry.message.template + sentry.message.parameter.* ---
  // Expected: message = "User logged in {...}", sentry.message.template = "User logged in {}", sentry.message.parameter.0 = { userId, sessionId }
  consola.info('User logged in', { userId: 123, sessionId: 'abc-123' });

  // Expected: message = formatted string, template + params for each following arg
  consola.warn('Payment processed', { orderId: 456 }, { amount: 99.99, currency: 'USD' });

  consola.error('Error occurred', 'in payment module', { errorCode: 'E001', retryable: true });

  consola.debug('Processing items', [1, 2, 3, 4, 5]);

  consola.info('Complex data', { user: { id: 789, name: 'Jane' }, metadata: { source: 'api' } });

  consola.info('Deep object', {
    level1: {
      level2: {
        level3: {
          level4: { level5: 'should be normalized' },
        },
      },
    },
    simpleKey: 'simple value',
  });

  // --- Object-first (first arg is plain object): attributes from object, message = second arg if string, rest → sentry.message.parameter.* ---
  // Expected: message = "User action", attributes userId: 789, sentry.message.parameter.0 = requestId, sentry.message.parameter.1 = timestamp
  consola.info({ userId: 789 }, 'User action', 'req-123', 1234567890);

  // Expected: message = "", attributes from object only
  consola.log({ event: 'click', buttonId: 'submit' });

  // --- Consola-merged (consola.log({ message, ...rest })): Consola puts message in args[0] and spreads rest on logObj ---
  // Expected: message = "inline-message", attributes userId, action, time (from logObj)
  consola.log({
    message: 'inline-message',
    userId: 123,
    action: 'login',
    time: new Date(),
  });

  // Fallback "Legacy log" style: first arg string, rest as params
  // Expected: message = "Legacy log {...} 123", sentry.message.template = "Legacy log {} {}", sentry.message.parameter.0 = { data: 1 }, .1 = 123
  consola.log('Legacy log', { data: 1 }, 123);

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
