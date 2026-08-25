import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction from module', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /example-module/transaction'
    );
  });

  await fetch(`${baseURL}/example-module/transaction`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.segment.name.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      'sentry.kind': 'server',
      'http.response.status_code': 200,
      'url.full': 'http://localhost:3030/example-module/transaction',
      'url.path': '/example-module/transaction',
      'server.address': 'localhost',
      'http.request.method': 'GET',
      'url.scheme': 'http',
      'http.target': '/example-module/transaction',
      'user_agent.original': 'node',
      'client.address': '::1',
      'client.port': expect.any(Number),
      'network.transport': 'tcp',
      'network.local.address': expect.any(String),
      'network.local.port': expect.any(Number),
      'network.peer.address': expect.any(String),
      'network.peer.port': expect.any(Number),
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
      'server.port': 3030,
      'http.response.status_text': 'OK',
      'http.route': '/example-module/transaction',
      'http.request.header.accept': '*/*',
      'http.request.header.accept_encoding': 'gzip, deflate',
      'http.request.header.accept_language': '*',
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': expect.any(String),
      'http.request.header.sec_fetch_mode': 'cors',
      'http.request.header.user_agent': 'node',
    },
    op: 'http.server',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.otel.http',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          data: {
            'express.name': '/example-module/transaction',
            'express.type': 'request_handler',
            'http.route': '/example-module/transaction',
            'sentry.origin': 'auto.http.express',
            'sentry.op': 'handler',
          },
          op: 'handler',
          description: '/example-module/transaction',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          origin: 'auto.http.express',
        },
        {
          data: {
            'sentry.origin': 'manual',
          },
          description: 'test-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          origin: 'manual',
        },
        {
          data: {
            'sentry.origin': 'manual',
          },
          description: 'child-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.origin': 'auto.http.nestjs',
            'sentry.op': 'handler',
            component: '@nestjs/core',
            'nestjs.version': expect.any(String),
            'nestjs.type': 'handler',
            'nestjs.callback': 'testTransaction',
          },
          description: 'testTransaction',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'auto.http.nestjs',
          op: 'handler',
        },
      ]),
      transaction: 'GET /example-module/transaction',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );
});

test('API route transaction includes exception filter span for global filter in module registered after Sentry', async ({
  baseURL,
}) => {
  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /example-module/expected-exception' &&
      transactionEvent?.request?.url?.includes('/example-module/expected-exception')
    );
  });

  const response = await fetch(`${baseURL}/example-module/expected-exception`);
  expect(response.status).toBe(400);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware',
            'sentry.origin': 'auto.middleware.nestjs.exception_filter',
          },
          description: 'ExampleExceptionFilter',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware',
          origin: 'auto.middleware.nestjs.exception_filter',
        },
      ]),
    }),
  );
});

test('API route transaction includes exception filter span for local filter in module registered after Sentry', async ({
  baseURL,
}) => {
  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /example-module-local-filter/expected-exception' &&
      transactionEvent?.request?.url?.includes('/example-module-local-filter/expected-exception')
    );
  });

  const response = await fetch(`${baseURL}/example-module-local-filter/expected-exception`);
  expect(response.status).toBe(400);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware',
            'sentry.origin': 'auto.middleware.nestjs.exception_filter',
          },
          description: 'LocalExampleExceptionFilter',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware',
          origin: 'auto.middleware.nestjs.exception_filter',
        },
      ]),
    }),
  );
});

test('API route transaction includes exception filter span for global filter in module registered before Sentry', async ({
  baseURL,
}) => {
  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /example-module-registered-first/expected-exception' &&
      transactionEvent?.request?.url?.includes('/example-module-registered-first/expected-exception')
    );
  });

  const response = await fetch(`${baseURL}/example-module-registered-first/expected-exception`);
  expect(response.status).toBe(400);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware',
            'sentry.origin': 'auto.middleware.nestjs.exception_filter',
          },
          description: 'ExampleExceptionFilterRegisteredFirst',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware',
          origin: 'auto.middleware.nestjs.exception_filter',
        },
      ]),
    }),
  );
});
