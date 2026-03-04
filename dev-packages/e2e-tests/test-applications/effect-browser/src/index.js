// @ts-check
import * as Sentry from '@sentry/effect';
import { Cause, Effect, Layer, Logger, LogLevel, Runtime } from 'effect';

const LogLevelLive = Logger.minimumLogLevel(LogLevel.Debug);
const AppLayer = Layer.mergeAll(
  Sentry.effectLayer({
    dsn: process.env.E2E_TEST_DSN,
    integrations: [
      Sentry.browserTracingIntegration({
        _experiments: { enableInteractions: true },
      }),
    ],
    tracesSampleRate: 1.0,
    release: 'e2e-test',
    environment: 'qa',
    tunnel: 'http://localhost:3031',
    enableLogs: true,
  }),
  LogLevelLive,
);

const runtime = Layer.toRuntime(AppLayer).pipe(Effect.scoped, Effect.runSync);

const runEffect = fn => Runtime.runPromise(runtime)(fn());

document.getElementById('exception-button')?.addEventListener('click', () => {
  throw new Error('I am an error!');
});

document.getElementById('effect-span-button')?.addEventListener('click', async () => {
  await runEffect(() =>
    Effect.gen(function* () {
      yield* Effect.sleep('50 millis');
      yield* Effect.sleep('25 millis').pipe(Effect.withSpan('nested-span'));
    }).pipe(Effect.withSpan('custom-effect-span', { kind: 'internal' })),
  );
  const el = document.getElementById('effect-span-result');
  if (el) el.textContent = 'Span sent!';
});

document.getElementById('effect-fail-button')?.addEventListener('click', async () => {
  try {
    await runEffect(() => Effect.fail(new Error('Effect failure')));
  } catch {
    const el = document.getElementById('effect-fail-result');
    if (el) el.textContent = 'Effect failed (expected)';
  }
});

document.getElementById('effect-die-button')?.addEventListener('click', async () => {
  try {
    await runEffect(() => Effect.die('Effect defect'));
  } catch {
    const el = document.getElementById('effect-die-result');
    if (el) el.textContent = 'Effect died (expected)';
  }
});

document.getElementById('log-button')?.addEventListener('click', async () => {
  await runEffect(() =>
    Effect.gen(function* () {
      yield* Effect.logDebug('Debug log from Effect');
      yield* Effect.logInfo('Info log from Effect');
      yield* Effect.logWarning('Warning log from Effect');
      yield* Effect.logError('Error log from Effect');
    }),
  );
  const el = document.getElementById('log-result');
  if (el) el.textContent = 'Logs sent!';
});

document.getElementById('log-context-button')?.addEventListener('click', async () => {
  await runEffect(() =>
    Effect.logInfo('Log with context').pipe(
      Effect.annotateLogs('userId', '12345'),
      Effect.annotateLogs('action', 'test'),
    ),
  );
  const el = document.getElementById('log-context-result');
  if (el) el.textContent = 'Log with context sent!';
});

document.getElementById('navigation-link')?.addEventListener('click', () => {
  document.getElementById('navigation-target')?.scrollIntoView({ behavior: 'smooth' });
});
