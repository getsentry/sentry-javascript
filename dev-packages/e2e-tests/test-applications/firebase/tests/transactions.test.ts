import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { runDockerCompose } from '../../../../node-integration-tests/utils/runner';

const spanAddDoc = expect.objectContaining({
  description: 'addDoc cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'addDoc',
    'db.system': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': '5504',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'addDoc',
  }),
  status: 'ok',
});

const spanSetDocs = expect.objectContaining({
  description: 'setDocs cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'setDocs',
    'db.system': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': '5504',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'setDocs',
  }),
  status: 'ok',
});

const spanGetDocs = expect.objectContaining({
  description: 'getDocs cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'getDocs',
    'db.system': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': '5504',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'getDocs',
  }),
  status: 'ok',
});

const spanDeleteDoc = expect.objectContaining({
  description: 'deleteDoc cities',
  data: expect.objectContaining({
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': 'deleteDoc',
    'db.system': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'otel.kind': 'CLIENT',
    'server.address': '127.0.0.1',
    'server.port': '5504',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'sentry.op': 'deleteDoc',
  }),
  status: 'ok',
});

let dockerChild;

test.beforeAll(async () => {
  console.log('creating firebase docker');
  dockerChild = await runDockerCompose({
    workingDirectory: [__dirname, '../docker'],
    readyMatches: ['Emulator Hub running at'],
  });
  console.log('firebase docker created');
});

test.afterAll(() => {
  dockerChild();
  console.log('firebase docker closed');
});

test('should add, set, get and delete document', async ({ baseURL, page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('firebase', transactionEvent => {
    return true;
  });

  await fetch(`${baseURL}/test`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent.transaction).toEqual('root span');

  expect(transactionEvent.spans?.length).toEqual(4);

  expect(transactionEvent.spans![0]).toMatchObject(spanAddDoc);
  expect(transactionEvent.spans![1]).toMatchObject(spanSetDocs);
  expect(transactionEvent.spans![2]).toMatchObject(spanGetDocs);
  expect(transactionEvent.spans![3]).toMatchObject(spanDeleteDoc);
});
