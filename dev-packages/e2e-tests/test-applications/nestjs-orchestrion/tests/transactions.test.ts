import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForTransaction } from '@sentry-internal/test-utils';

const PROXY = 'nestjs-orchestrion';

// Find a child span by op + origin within a transaction event.
function findSpan(
  transactionEvent: Awaited<ReturnType<typeof waitForTransaction>>,
  op: string,
  origin: string,
): { description?: string; op?: string; origin?: string } | undefined {
  return (transactionEvent.spans ?? []).find(
    span => span.op === op && span.origin === origin,
  );
}

test('app_creation: emits a "Create Nest App" transaction at startup', async () => {
  // Emitted once at startup (NestFactory.create), before any request, so look
  // back through buffered envelopes rather than waiting for a new transaction.
  const envelopeItem = await waitForEnvelopeItem(
    PROXY,
    item => item[0].type === 'transaction' && (item[1] as { transaction?: string }).transaction === 'Create Nest App',
    0,
  );

  const transaction = envelopeItem[1] as {
    contexts: { trace: { op?: string; origin?: string; data?: Record<string, unknown> } };
  };

  expect(transaction.contexts.trace.op).toBe('app_creation.nestjs');
  expect(transaction.contexts.trace.origin).toBe('auto.http.otel.nestjs');
  expect(transaction.contexts.trace.data).toEqual(
    expect.objectContaining({
      'component': '@nestjs/core',
      'nestjs.type': 'app_creation',
      'nestjs.module': 'AppModule',
    }),
  );
});

test('request_context + handler: a route transaction nests the nestjs spans', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(PROXY, transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await fetch(`${baseURL}/test-transaction`);
  const transactionEvent = await transactionPromise;

  // request_context span: `{Controller}.{handler}`, carries http + controller/callback attrs.
  const requestContext = findSpan(transactionEvent, 'request_context.nestjs', 'auto.http.otel.nestjs');
  expect(requestContext).toBeDefined();
  expect(requestContext?.description).toBe('AppController.testTransaction');

  // request_handler span: wraps the controller method itself.
  const handler = (transactionEvent.spans ?? []).find(
    span => span.op === 'handler.nestjs' && span.description === 'testTransaction',
  );
  expect(handler).toBeDefined();
});

// op + origin produced by `@Injectable`/`@Catch` instrumentation, per component type.
const MIDDLEWARE_CASES = [
  { route: 'test-middleware', origin: 'auto.middleware.nestjs', description: 'ExampleMiddleware' },
  { route: 'test-guard', origin: 'auto.middleware.nestjs.guard', description: 'ExampleGuard' },
  { route: 'test-pipe/123', origin: 'auto.middleware.nestjs.pipe', description: 'ParseIntPipe' },
  { route: 'test-interceptor', origin: 'auto.middleware.nestjs.interceptor', description: 'ExampleInterceptor' },
] as const;

for (const { route, origin, description } of MIDDLEWARE_CASES) {
  test(`middleware span: ${origin} (${description})`, async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(PROXY, transactionEvent => {
      return (
        transactionEvent?.contexts?.trace?.op === 'http.server' &&
        transactionEvent?.transaction === `GET /${route.replace('/123', '/:id')}`
      );
    });

    await fetch(`${baseURL}/${route}`);
    const transactionEvent = await transactionPromise;

    const span = findSpan(transactionEvent, 'middleware.nestjs', origin);
    expect(span, `expected a ${origin} span`).toBeDefined();
    expect(span?.description).toBe(description);
  });
}

test('exception_filter span: a @Catch filter opens a middleware.nestjs span', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(PROXY, transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-exception'
    );
  });

  await fetch(`${baseURL}/test-exception`);
  const transactionEvent = await transactionPromise;

  const span = findSpan(transactionEvent, 'middleware.nestjs', 'auto.middleware.nestjs.exception_filter');
  expect(span).toBeDefined();
  expect(span?.description).toBe('ExampleExceptionFilter');
});
