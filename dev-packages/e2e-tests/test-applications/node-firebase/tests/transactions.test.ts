import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// The same suite runs against both the OTel integration and (with `E2E_ORCHESTRION=true`) the
// orchestrion diagnostics-channel one. The spans are identical apart from the origin — and the
// orchestrion spans are Sentry-native, so they carry no OTel-only `otel.kind` attribute.
const orchestrion = process.env.E2E_ORCHESTRION === 'true';
const origin = orchestrion ? 'auto.firebase.orchestrion.firestore' : 'auto.firebase.otel.firestore';

function firestoreSpan(operation: string): unknown {
  const data: Record<string, unknown> = {
    'db.collection.name': 'cities',
    'db.namespace': '[DEFAULT]',
    'db.operation.name': operation,
    'db.system.name': 'firebase.firestore',
    'firebase.firestore.options.projectId': 'sentry-15d85',
    'firebase.firestore.type': 'collection',
    'server.address': '127.0.0.1',
    'server.port': 8080,
    'sentry.origin': origin,
    'sentry.op': 'db.query',
  };
  if (!orchestrion) {
    data['otel.kind'] = 'CLIENT';
  }

  return expect.objectContaining({
    description: `${operation} cities`,
    data: expect.objectContaining(data),
    op: 'db.query',
    origin,
    parent_span_id: expect.any(String),
    trace_id: expect.any(String),
    span_id: expect.any(String),
    timestamp: expect.any(Number),
    start_timestamp: expect.any(Number),
    status: 'ok',
  });
}

const spanAddDoc = firestoreSpan('addDoc');
const spanSetDocs = firestoreSpan('setDoc');
const spanGetDocs = firestoreSpan('getDocs');
const spanDeleteDoc = firestoreSpan('deleteDoc');

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
