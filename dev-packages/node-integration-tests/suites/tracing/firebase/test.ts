import type { TransactionEvent } from '@sentry/types';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

const spanAddDoc = expect.objectContaining({
  description: 'addDoc',
  data: expect.objectContaining({
    'firebase.firestore.table': 'cities',
    'firebase.firestore.type': 'collection',
    'firebase.firestore.app.name': '[DEFAULT]',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'otel.kind': 'CLIENT',
  }),
  status: 'ok',
});

const spanSetDocs = expect.objectContaining({
  description: 'setDocs',
  data: expect.objectContaining({
    'firebase.firestore.table': 'cities',
    'firebase.firestore.type': 'collection',
    'firebase.firestore.app.name': '[DEFAULT]',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'otel.kind': 'CLIENT',
  }),
  status: 'ok',
});

const spanGetDocs = expect.objectContaining({
  description: 'getDocs',
  data: expect.objectContaining({
    'firebase.firestore.table': 'cities',
    'firebase.firestore.type': 'collection',
    'firebase.firestore.app.name': '[DEFAULT]',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'otel.kind': 'CLIENT',
  }),
  status: 'ok',
});

const spanDeleteDoc = expect.objectContaining({
  description: 'deleteDoc',
  data: expect.objectContaining({
    'firebase.firestore.table': 'cities',
    'firebase.firestore.type': 'collection',
    'firebase.firestore.app.name': '[DEFAULT]',
    'sentry.origin': 'auto.firebase.otel.firestore',
    'otel.kind': 'CLIENT',
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
