import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should only call the function once without any extra calls', async () => {
  const serverTransactionPromise = waitForTransaction('node-firebase', span => {
    return span.transaction === 'firebase.function.http.request';
  });

  await fetch(`http://localhost:5001/demo-functions/default/helloWorld`);

  const transactionEvent = await serverTransactionPromise;

  expect(transactionEvent.transaction).toEqual('firebase.function.http.request');
  expect(transactionEvent.contexts).toEqual(
    expect.objectContaining({
      trace: expect.objectContaining({
        data: {
          'faas.name': 'helloWorld',
          'faas.provider': 'firebase',
          'faas.trigger': 'http.request',
          'otel.kind': 'SERVER',
          'sentry.op': 'http.request',
          'sentry.origin': 'auto.firebase.otel.functions',
          'sentry.sample_rate': expect.any(Number),
          'sentry.source': 'route',
        },
        op: 'http.request',
        origin: 'auto.firebase.otel.functions',
        span_id: expect.any(String),
        status: 'ok',
        trace_id: expect.any(String),
      }),
    }),
  );
});

test('should create a document and trigger onDocumentCreated and another with authContext', async () => {
  const serverTransactionPromise = waitForTransaction('node-firebase', span => {
    return span.transaction === 'firebase.function.http.request';
  });

  const serverTransactionOnDocumentCreatePromise = waitForTransaction('node-firebase', span => {
    return (
      span.transaction === 'firebase.function.firestore.document.created' &&
      span.contexts?.trace?.data?.['faas.name'] === 'onDocumentCreate'
    );
  });

  const serverTransactionOnDocumentWithAuthContextCreatePromise = waitForTransaction('node-firebase', span => {
    return (
      span.transaction === 'firebase.function.firestore.document.created' &&
      span.contexts?.trace?.data?.['faas.name'] === 'onDocumentCreateWithAuthContext'
    );
  });

  await fetch(`http://localhost:5001/demo-functions/default/onCallSomething`);

  const transactionEvent = await serverTransactionPromise;
  const transactionEventOnDocumentCreate = await serverTransactionOnDocumentCreatePromise;
  const transactionEventOnDocumentWithAuthContextCreate = await serverTransactionOnDocumentWithAuthContextCreatePromise;

  expect(transactionEvent.transaction).toEqual('firebase.function.http.request');
  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'faas.name': 'onCallSomething',
      'faas.provider': 'firebase',
      'faas.trigger': 'http.request',
      'otel.kind': 'SERVER',
      'sentry.op': 'http.request',
      'sentry.origin': 'auto.firebase.otel.functions',
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
    op: 'http.request',
    origin: 'auto.firebase.otel.functions',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEvent.spans).toHaveLength(3);
  expect(transactionEventOnDocumentCreate.contexts?.trace).toEqual({
    data: {
      'faas.name': 'onDocumentCreate',
      'faas.provider': 'firebase',
      'faas.trigger': 'firestore.document.created',
      'otel.kind': 'SERVER',
      'sentry.op': expect.any(String),
      'sentry.origin': 'auto.firebase.otel.functions',
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
    op: expect.any(String),
    origin: 'auto.firebase.otel.functions',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEventOnDocumentCreate.spans).toHaveLength(2);
  expect(transactionEventOnDocumentWithAuthContextCreate.contexts?.trace).toEqual({
    data: {
      'faas.name': 'onDocumentCreateWithAuthContext',
      'faas.provider': 'firebase',
      'faas.trigger': 'firestore.document.created',
      'otel.kind': 'SERVER',
      'sentry.op': expect.any(String),
      'sentry.origin': 'auto.firebase.otel.functions',
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
    op: expect.any(String),
    origin: 'auto.firebase.otel.functions',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEventOnDocumentWithAuthContextCreate.spans).toHaveLength(0);
});
