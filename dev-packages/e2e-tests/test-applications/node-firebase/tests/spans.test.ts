import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

// The orchestrion spans are Sentry-native, so they carry no span-kind attribute (`sentry.kind`).
const origin = 'auto.firebase.firestore';

function firestoreSpan(operation: string): unknown {
  return expect.objectContaining({
    name: `${operation} cities`,
    is_segment: false,
    parent_span_id: expect.any(String),
    trace_id: expect.any(String),
    span_id: expect.any(String),
    end_timestamp: expect.any(Number),
    start_timestamp: expect.any(Number),
    status: 'ok',
    attributes: expect.objectContaining({
      'db.collection.name': { value: 'cities', type: 'string' },
      'db.namespace': { value: '[DEFAULT]', type: 'string' },
      'db.operation.name': { value: operation, type: 'string' },
      'db.system.name': { value: 'firebase.firestore', type: 'string' },
      'firebase.firestore.options.projectId': { value: 'sentry-15d85', type: 'string' },
      'firebase.firestore.type': { value: 'collection', type: 'string' },
      'server.address': { value: '127.0.0.1', type: 'string' },
      'server.port': { value: 8080, type: 'integer' },
      'sentry.origin': { value: origin, type: 'string' },
      'sentry.op': { value: 'db.query', type: 'string' },
    }),
  });
}

const spanAddDoc = firestoreSpan('addDoc');
const spanSetDocs = firestoreSpan('setDoc');
const spanGetDocs = firestoreSpan('getDocs');
const spanDeleteDoc = firestoreSpan('deleteDoc');

test('should add, set, get and delete document', async ({ baseURL }) => {
  const serverSegmentPromise = collectStreamedSpansUntilSegment('node-firebase', 'Test Transaction');

  await fetch(`${baseURL}/test`);

  const segmentEventSpans = await serverSegmentPromise;
  const segmentEvent = segmentEventSpans.find(segment => segment.is_segment && segment.name === 'Test Transaction')!;

  expect(segmentEvent.name).toEqual('Test Transaction');
  const children = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );
  expect(children).toHaveLength(4);
  expect(children).toEqual(expect.arrayContaining([spanAddDoc, spanSetDocs, spanGetDocs, spanDeleteDoc]));
});
