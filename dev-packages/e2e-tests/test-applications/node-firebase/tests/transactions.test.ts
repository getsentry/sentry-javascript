import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const spanAddDoc = expect.objectContaining({
  description: 'addDoc cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'addDoc',
    'db.system.name': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': 8080,
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'db.query',
  }),
  op: 'db.query',
  origin: 'auto.firebase.otel.firestore',
  parent_span_id: expect.any(String),
  trace_id: expect.any(String),
  span_id: expect.any(String),
  timestamp: expect.any(Number),
  start_timestamp: expect.any(Number),
  status: 'ok',
});

const spanSetDocs = expect.objectContaining({
  description: 'setDoc cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'setDoc',
    'db.system.name': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': 8080,
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'db.query',
  }),
  op: 'db.query',
  origin: 'auto.firebase.otel.firestore',
  parent_span_id: expect.any(String),
  trace_id: expect.any(String),
  span_id: expect.any(String),
  timestamp: expect.any(Number),
  start_timestamp: expect.any(Number),
  status: 'ok',
});

const spanGetDocs = expect.objectContaining({
  description: 'getDocs cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'getDocs',
    'db.system.name': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': 8080,
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'db.query',
  }),
  op: 'db.query',
  origin: 'auto.firebase.otel.firestore',
  parent_span_id: expect.any(String),
  trace_id: expect.any(String),
  span_id: expect.any(String),
  timestamp: expect.any(Number),
  start_timestamp: expect.any(Number),
  status: 'ok',
});

const spanDeleteDoc = expect.objectContaining({
  description: 'deleteDoc cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'deleteDoc',
    'db.system.name': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': 8080,
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'db.query',
  }),
  op: 'db.query',
  origin: 'auto.firebase.otel.firestore',
  parent_span_id: expect.any(String),
  trace_id: expect.any(String),
  span_id: expect.any(String),
  timestamp: expect.any(Number),
  start_timestamp: expect.any(Number),
  status: 'ok',
});

test('should add, set, get and delete document', async ({ baseURL, page }) => {
  const serverTransactionPromise = waitForTransaction('node-firebase', span => {
    return span.transaction === 'Test Transaction';
  });

  await fetch(`${baseURL}/test`);

  const transactionEvent = await serverTransactionPromise;

  expect(transactionEvent.transaction).toEqual('Test Transaction');
  expect(transactionEvent.spans?.length).toEqual(4);

  expect(transactionEvent.spans).toEqual(expect.arrayContaining([spanAddDoc, spanSetDocs, spanGetDocs, spanDeleteDoc]));
});
