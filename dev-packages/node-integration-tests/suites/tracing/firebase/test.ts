import type { TransactionEvent } from '@sentry/types';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(600_000);

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

describe('firebase auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  describe('firestore', () => {
    test('should add, set, get and delete document', done => {
      createRunner(__dirname, 'scenario.ts')
        .withDockerCompose({
          workingDirectory: [__dirname, 'docker'],
          readyMatches: ['Emulator Hub running at'],
        })
        .expect({
          transaction: (transaction: TransactionEvent) => {
            expect(transaction.transaction).toEqual('root span');

            expect(transaction.spans?.length).toEqual(4);

            expect(transaction.spans![0]).toMatchObject(spanAddDoc);
            expect(transaction.spans![1]).toMatchObject(spanSetDocs);
            expect(transaction.spans![2]).toMatchObject(spanGetDocs);
            expect(transaction.spans![3]).toMatchObject(spanDeleteDoc);
          },
        })
        .start(done);
    });
  });
});
