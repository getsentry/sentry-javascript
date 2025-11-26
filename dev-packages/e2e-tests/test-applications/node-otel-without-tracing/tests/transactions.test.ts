import { expect, test } from '@playwright/test';
import { waitForPlainRequest, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction to OTLP', async ({ baseURL }) => {
  waitForTransaction('node-otel-without-tracing', transactionEvent => {
    throw new Error('THIS SHOULD NEVER HAPPEN!');
  });

  // Ensure we send data to the OTLP endpoint
  const otelPromise = waitForPlainRequest('node-otel-without-tracing-otel', data => {
    const json = JSON.parse(data) as any;

    const scopeSpans = json.resourceSpans?.[0]?.scopeSpans;

    const httpScope = scopeSpans?.find(scopeSpan => scopeSpan.scope.name === '@opentelemetry/instrumentation-http');

    return (
      httpScope &&
      httpScope.spans.some(span =>
        span.attributes.some(attr => attr.key === 'http.target' && attr.value?.stringValue === '/test-transaction'),
      )
    );
  });

  fetch(`${baseURL}/test-transaction`);

  const otelData = await otelPromise;

  expect(otelData).toBeDefined();

  const json = JSON.parse(otelData);
  expect(json.resourceSpans.length).toBe(1);

  const scopeSpans = json.resourceSpans?.[0]?.scopeSpans;
  expect(scopeSpans).toBeDefined();

  // Http server span & undici client spans are emitted.
  // Sentry.startSpan() spans are NOT emitted (non-recording when tracing is disabled).
  // Our default node-fetch spans are also not emitted.
  expect(scopeSpans.length).toEqual(2);

  const httpScopes = scopeSpans?.filter(scopeSpan => scopeSpan.scope.name === '@opentelemetry/instrumentation-http');
  const undiciScopes = scopeSpans?.filter(
    scopeSpan => scopeSpan.scope.name === '@opentelemetry/instrumentation-undici',
  );
  const startSpanScopes = scopeSpans?.filter(scopeSpan => scopeSpan.scope.name === '@sentry/node');

  expect(httpScopes.length).toBe(1);

  // Sentry spans should not be exported when tracing is disabled
  expect(startSpanScopes.length).toBe(0);

  // Undici spans are emitted correctly
  expect(undiciScopes.length).toBe(1);
  expect(undiciScopes[0].spans.length).toBe(1);

  expect(undiciScopes[0].spans).toEqual([
    {
      traceId: expect.any(String),
      spanId: expect.any(String),
      name: 'GET',
      kind: 3,
      startTimeUnixNano: expect.any(String),
      endTimeUnixNano: expect.any(String),
      attributes: expect.arrayContaining([
        { key: 'http.request.method', value: { stringValue: 'GET' } },
        { key: 'http.request.method_original', value: { stringValue: 'GET' } },
        { key: 'url.full', value: { stringValue: 'http://localhost:3030/test-success' } },
        { key: 'url.path', value: { stringValue: '/test-success' } },
        { key: 'url.query', value: { stringValue: '' } },
        { key: 'url.scheme', value: { stringValue: 'http' } },
        { key: 'server.address', value: { stringValue: 'localhost' } },
        { key: 'server.port', value: { intValue: 3030 } },
        { key: 'user_agent.original', value: { stringValue: 'node' } },
        { key: 'network.peer.address', value: { stringValue: expect.any(String) } },
        { key: 'network.peer.port', value: { intValue: 3030 } },
        { key: 'http.response.status_code', value: { intValue: 200 } },
        { key: 'http.response.header.content-length', value: { intValue: 16 } },
      ]),
      droppedAttributesCount: 0,
      events: [],
      droppedEventsCount: 0,
      status: { code: 0 },
      links: [],
      droppedLinksCount: 0,
      flags: expect.any(Number),
    },
  ]);

  // There may be another span from another request, we can ignore that
  const httpSpans = httpScopes[0].spans.filter(span =>
    span.attributes.some(attr => attr.key === 'http.target' && attr.value?.stringValue === '/test-transaction'),
  );

  expect(httpSpans).toEqual([
    {
      traceId: expect.any(String),
      spanId: expect.any(String),
      name: 'GET',
      kind: 2,
      startTimeUnixNano: expect.any(String),
      endTimeUnixNano: expect.any(String),
      attributes: expect.arrayContaining([
        { key: 'http.url', value: { stringValue: 'http://localhost:3030/test-transaction' } },
        { key: 'http.host', value: { stringValue: 'localhost:3030' } },
        { key: 'net.host.name', value: { stringValue: 'localhost' } },
        { key: 'http.method', value: { stringValue: 'GET' } },
        { key: 'http.scheme', value: { stringValue: 'http' } },
        { key: 'http.target', value: { stringValue: '/test-transaction' } },
        { key: 'http.user_agent', value: { stringValue: 'node' } },
        { key: 'http.flavor', value: { stringValue: '1.1' } },
        { key: 'net.transport', value: { stringValue: 'ip_tcp' } },
        { key: 'net.host.ip', value: { stringValue: expect.any(String) } },
        { key: 'net.host.port', value: { intValue: 3030 } },
        { key: 'net.peer.ip', value: { stringValue: expect.any(String) } },
        { key: 'net.peer.port', value: { intValue: expect.any(Number) } },
        { key: 'http.status_code', value: { intValue: 200 } },
        { key: 'http.status_text', value: { stringValue: 'OK' } },
      ]),
      droppedAttributesCount: 0,
      events: [],
      droppedEventsCount: 0,
      status: {
        code: 0,
      },
      links: [],
      droppedLinksCount: 0,
      flags: expect.any(Number),
    },
  ]);
});

test('Custom OTel spans work with onlyIfParent when no parent exists', async ({ baseURL }) => {
  waitForTransaction('node-otel-without-tracing', transactionEvent => {
    throw new Error('THIS SHOULD NEVER HAPPEN!');
  });

  // Ensure we send data to the OTLP endpoint
  const otelPromise = waitForPlainRequest('node-otel-without-tracing-otel', data => {
    const json = JSON.parse(data) as any;

    const scopeSpans = json.resourceSpans?.[0]?.scopeSpans;

    // Look for the custom span from our custom-tracer
    const customScope = scopeSpans?.find(scopeSpan => scopeSpan.scope.name === 'custom-tracer');

    return customScope && customScope.spans.some(span => span.name === 'custom-span-with-only-if-parent');
  });

  fetch(`${baseURL}/test-only-if-parent`);

  const otelData = await otelPromise;

  expect(otelData).toBeDefined();

  const json = JSON.parse(otelData);
  expect(json.resourceSpans.length).toBe(1);

  const scopeSpans = json.resourceSpans?.[0]?.scopeSpans;
  expect(scopeSpans).toBeDefined();

  // Should have HTTP instrumentation span but NO Sentry span
  const httpScopes = scopeSpans?.filter(scopeSpan => scopeSpan.scope.name === '@opentelemetry/instrumentation-http');
  const sentryScopes = scopeSpans?.filter(scopeSpan => scopeSpan.scope.name === '@sentry/node');
  const customScopes = scopeSpans?.filter(scopeSpan => scopeSpan.scope.name === 'custom-tracer');

  // HTTP span exists (from the incoming request)
  expect(httpScopes.length).toBe(1);

  // Sentry span should NOT exist (onlyIfParent + no parent = suppressed)
  expect(sentryScopes.length).toBe(0);

  // Custom OTel span SHOULD exist (this is what we're testing - the fix ensures this works)
  expect(customScopes.length).toBe(1);
  expect(customScopes[0].spans.length).toBe(1);
  expect(customScopes[0].spans[0]).toMatchObject({
    name: 'custom-span-with-only-if-parent',
    kind: 1,
    status: { code: 0 },
  });

  // Verify the custom span is recording (not suppressed)
  const customSpan = customScopes[0].spans[0];
  expect(customSpan.spanId).not.toBe('0000000000000000');
  expect(customSpan.traceId).not.toBe('00000000000000000000000000000000');
});
