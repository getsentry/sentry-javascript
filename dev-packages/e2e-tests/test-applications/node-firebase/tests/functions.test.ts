import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForError,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';

test('should create one segment for an HTTP function', async () => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'node-firebase',
    span => span.name === 'firebase.function.http.request' && span.attributes['faas.name']?.value === 'helloWorld',
  );

  const response = await fetch('http://localhost:5001/demo-functions/default/helloWorld');

  expect(response.ok).toBe(true);
  const spans = await spansPromise;
  expect(spans).toHaveLength(1);
  const span = spans[0]!;
  expect(getSpanOp(span)).toBe('function.gcp');
  expect(span).toMatchObject({
    name: 'firebase.function.http.request',
    status: 'ok',
    span_id: expect.any(String),
    trace_id: expect.any(String),
    attributes: expect.objectContaining({
      'cloud.project_id': { value: 'demo-functions', type: 'string' },
      'faas.name': { value: 'helloWorld', type: 'string' },
      'faas.provider': { value: 'firebase', type: 'string' },
      'faas.trigger': { value: 'http.request', type: 'string' },
      'sentry.kind': { value: 'server', type: 'string' },
      'sentry.origin': { value: 'auto.firebase.functions', type: 'string' },
      'sentry.sample_rate': { value: expect.any(Number), type: 'integer' },
      'sentry.segment.name.source': { value: 'component', type: 'string' },
    }),
  });
});

test('should send failed span when the function fails', async () => {
  const errorPromise = waitForError(
    'node-firebase',
    event => event.exception?.values?.[0]?.value === 'There is an error!',
  );
  const spanPromise = waitForStreamedSpan(
    'node-firebase',
    span =>
      span.is_segment &&
      span.name === 'firebase.function.http.request' &&
      span.attributes['faas.name']?.value === 'unhandeledError',
  );

  await fetch('http://localhost:5001/demo-functions/default/unhandeledError');

  const span = await spanPromise;
  const error = await errorPromise;
  expect(span.status).toBe('error');
  expect(span.trace_id).toBe(error.contexts?.trace?.trace_id);
  expect(span.span_id).toBe(error.contexts?.trace?.span_id);
  expect(error.exception?.values).toEqual([
    expect.objectContaining({
      type: 'Error',
      value: 'There is an error!',
      mechanism: { type: 'auto.firebase.functions', handled: false },
    }),
  ]);
});

test('should create a document and trigger onDocumentCreated and another with authContext', async () => {
  const functions = [
    { name: 'onCallSomething', trigger: 'http.request' },
    { name: 'onDocumentCreate', trigger: 'firestore.document.created' },
    { name: 'onDocumentCreateWithAuthContext', trigger: 'firestore.document.created' },
  ];
  const spanPromises = functions.map(({ name }) =>
    collectStreamedSpansUntilSegment('node-firebase', span => span.attributes['faas.name']?.value === name),
  );

  const response = await fetch('http://localhost:5001/demo-functions/default/onCallSomething');

  expect(response.ok).toBe(true);
  const traces = await Promise.all(spanPromises);
  functions.forEach(({ name, trigger }, index) => {
    const spans = traces[index]!;
    expect(spans).toHaveLength(1);
    const segment = spans[0]!;
    expect(segment).toMatchObject({
      name: `firebase.function.${trigger}`,
      status: 'ok',
      span_id: expect.any(String),
      trace_id: expect.any(String),
      attributes: expect.objectContaining({
        'cloud.project_id': { value: 'demo-functions', type: 'string' },
        'faas.name': { value: name, type: 'string' },
        'faas.provider': { value: 'firebase', type: 'string' },
        'faas.trigger': { value: trigger, type: 'string' },
        'sentry.kind': { value: 'server', type: 'string' },
        'sentry.op': { value: 'function.gcp', type: 'string' },
        'sentry.origin': { value: 'auto.firebase.functions', type: 'string' },
        'sentry.sample_rate': { value: expect.any(Number), type: 'integer' },
        'sentry.segment.name.source': { value: 'component', type: 'string' },
      }),
    });
  });
});
