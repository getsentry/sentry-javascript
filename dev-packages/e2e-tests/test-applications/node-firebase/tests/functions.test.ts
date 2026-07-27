import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

// FIXME: firebase-functions runs inside the Firebase emulator, where the channel-injection runtime
// module hook doesn't transform the emulator-loaded handlers, so no channel spans are produced.
// (Firestore in a plain Node process works.) Deferred; tracked separately for a channel firebase-
// functions emulator fix.
test.fixme('should only call the function once without any extra calls', async () => {
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
          'cloud.project_id': 'demo-functions',
          'faas.name': 'helloWorld',
          'faas.provider': 'firebase',
          'faas.trigger': 'http.request',
          'sentry.kind': 'server',
          'sentry.op': 'function.gcp',
          'sentry.origin': 'auto.firebase.orchestrion.functions',
          'sentry.sample_rate': expect.any(Number),
          'sentry.source': 'route',
        },
        op: 'function.gcp',
        origin: 'auto.firebase.orchestrion.functions',
        span_id: expect.any(String),
        status: 'ok',
        trace_id: expect.any(String),
      }),
    }),
  );
});

test.fixme('should send failed transaction when the function fails', async () => {
  const errorEventPromise = waitForError('node-firebase', () => true);
  const serverTransactionPromise = waitForTransaction('node-firebase', span => {
    return !!span.transaction;
  });

  await fetch(`http://localhost:5001/demo-functions/default/unhandeledError`);

  const transactionEvent = await serverTransactionPromise;
  const errorEvent = await errorEventPromise;

  expect(transactionEvent.transaction).toEqual('firebase.function.http.request');
  expect(transactionEvent.contexts?.trace?.trace_id).toEqual(errorEvent.contexts?.trace?.trace_id);
  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'There is an error!',
          mechanism: {
            type: 'auto.firebase.orchestrion.functions',
            handled: false,
          },
        },
      ],
    },
  });
});

test.fixme('should create a document and trigger onDocumentCreated and another with authContext', async () => {
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
      'cloud.project_id': 'demo-functions',
      'faas.name': 'onCallSomething',
      'faas.provider': 'firebase',
      'faas.trigger': 'http.request',
      'sentry.kind': 'server',
<<<<<<< HEAD
      'sentry.op': 'http.request',
      'sentry.origin': 'auto.firebase.orchestrion.functions',
||||||| parent of e1785e3201 (feat(node)!: Use `function.gcp` span op for Firebase functions)
      'sentry.op': 'http.request',
      'sentry.origin': 'auto.firebase.otel.functions',
=======
      'sentry.op': 'function.gcp',
      'sentry.origin': 'auto.firebase.otel.functions',
>>>>>>> e1785e3201 (feat(node)!: Use `function.gcp` span op for Firebase functions)
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
<<<<<<< HEAD
    op: 'http.request',
    origin: 'auto.firebase.orchestrion.functions',
||||||| parent of e1785e3201 (feat(node)!: Use `function.gcp` span op for Firebase functions)
    op: 'http.request',
    origin: 'auto.firebase.otel.functions',
=======
    op: 'function.gcp',
    origin: 'auto.firebase.otel.functions',
>>>>>>> e1785e3201 (feat(node)!: Use `function.gcp` span op for Firebase functions)
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEvent.spans).toHaveLength(3);
  expect(transactionEventOnDocumentCreate.contexts?.trace).toEqual({
    data: {
      'cloud.project_id': 'demo-functions',
      'faas.name': 'onDocumentCreate',
      'faas.provider': 'firebase',
      'faas.trigger': 'firestore.document.created',
      'sentry.kind': 'server',
      'sentry.op': expect.any(String),
      'sentry.origin': 'auto.firebase.orchestrion.functions',
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
    op: expect.any(String),
    origin: 'auto.firebase.orchestrion.functions',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEventOnDocumentCreate.spans).toHaveLength(2);
  expect(transactionEventOnDocumentWithAuthContextCreate.contexts?.trace).toEqual({
    data: {
      'cloud.project_id': 'demo-functions',
      'faas.name': 'onDocumentCreateWithAuthContext',
      'faas.provider': 'firebase',
      'faas.trigger': 'firestore.document.created',
      'sentry.kind': 'server',
      'sentry.op': expect.any(String),
      'sentry.origin': 'auto.firebase.orchestrion.functions',
      'sentry.sample_rate': expect.any(Number),
      'sentry.source': 'route',
    },
    op: expect.any(String),
    origin: 'auto.firebase.orchestrion.functions',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });
  expect(transactionEventOnDocumentWithAuthContextCreate.spans).toHaveLength(0);
});
