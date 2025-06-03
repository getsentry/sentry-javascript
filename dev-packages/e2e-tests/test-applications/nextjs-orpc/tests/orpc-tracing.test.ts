import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should trace orpc server component', async ({ page }) => {
  const pageloadPromise = waitForTransaction('nextjs-orpc', transactionEvent => {
    return transactionEvent.transaction === '/';
  });

  const orpcTxPromise = waitForTransaction('nextjs-orpc', transactionEvent => {
    return transactionEvent.transaction === 'POST /rpc/[[...rest]]';
  });

  await page.goto('/');
  const pageloadTx = await pageloadPromise;
  const orpcTx = await orpcTxPromise;

  expect(pageloadTx.contexts?.trace).toMatchObject({
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    trace_id: expect.any(String),
    data: {
      'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
      'sentry.op': 'pageload',
      'sentry.source': 'url',
    },
    op: 'pageload',
    origin: 'auto.pageload.nextjs.app_router_instrumentation',
  });

  expect(orpcTx.contexts?.trace).toMatchObject({
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    trace_id: pageloadTx.contexts?.trace?.trace_id,
    data: {
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.source': 'route',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'next.span_name': 'POST /rpc/[[...rest]]/route',
      'next.span_type': 'BaseServer.handleRequest',
      'http.method': 'POST',
      'http.target': '/rpc/planet/list',
      'next.rsc': false,
      'http.route': '/rpc/[[...rest]]/route',
      'next.route': '/rpc/[[...rest]]',
      'http.status_code': 200,
    },
    op: 'http.server',
    origin: 'auto',
  });

  expect(orpcTx.spans?.map(span => span.description)).toContain('ORPC Middleware');
});

test('should trace orpc client component', async ({ page }) => {
  const navigationPromise = waitForTransaction('nextjs-orpc', transactionEvent => {
    return transactionEvent.transaction === '/client';
  });

  const orpcTxPromise = waitForTransaction('nextjs-orpc', transactionEvent => {
    return (
      transactionEvent.transaction === 'POST /rpc/[[...rest]]' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === '/rpc/planet/find'
    );
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: 'Client' }).click();
  const navigationTx = await navigationPromise;
  const orpcTx = await orpcTxPromise;

  expect(navigationTx.contexts?.trace).toMatchObject({
    span_id: expect.any(String),
    trace_id: expect.any(String),
    data: {
      'sentry.op': 'navigation',
      'sentry.origin': 'auto.navigation.nextjs.app_router_instrumentation',
      'sentry.source': 'url',
      'sentry.previous_trace': expect.any(String),
    },
    op: 'navigation',
    origin: 'auto.navigation.nextjs.app_router_instrumentation',
  });

  expect(orpcTx?.contexts?.trace).toMatchObject({
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    trace_id: navigationTx?.contexts?.trace?.trace_id,
    data: {
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.source': 'route',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'next.span_name': 'POST /rpc/[[...rest]]/route',
      'next.span_type': 'BaseServer.handleRequest',
      'http.method': 'POST',
      'http.target': '/rpc/planet/find',
      'next.rsc': false,
      'http.route': '/rpc/[[...rest]]/route',
      'next.route': '/rpc/[[...rest]]',
      'http.status_code': 200,
    },
    op: 'http.server',
    origin: 'auto',
  });

  expect(orpcTx.spans?.map(span => span.description)).toContain('ORPC Middleware');
});
