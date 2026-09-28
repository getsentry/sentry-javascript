import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

const OPERATION_METHODS = ['create', 'all', 'delete'];

function isPrismaOperation(span: SerializedStreamedSpan): boolean {
  return span.attributes['sentry.origin']?.value === 'auto.db.prisma';
}

function isTestPrismaSegment(span: SerializedStreamedSpan): boolean {
  return getSpanOp(span) === 'http.server' && span.is_segment === true && span.name === 'GET /test-prisma';
}

test('Prisma 8 ORM calls emit operation spans with the pg queries nested underneath', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'node-prisma-8',
    spans => spans.some(isTestPrismaSegment) && spans.filter(isPrismaOperation).length >= OPERATION_METHODS.length,
  );

  const res = await fetch(`${baseURL}/test-prisma`);
  expect(res.status).toBe(200);

  const spans = await spansPromise;
  const segment = spans.find(isTestPrismaSegment)!;
  const operationSpans = spans.filter(isPrismaOperation);
  const spansById = new Map(spans.map(span => [span.span_id, span]));
  // The Express request-handler span sits between the segment and the ORM calls.
  const isInSegment = (span: SerializedStreamedSpan): boolean => {
    for (let parent = span.parent_span_id; parent; parent = spansById.get(parent)?.parent_span_id) {
      if (parent === segment.span_id) {
        return true;
      }
    }
    return false;
  };

  expect(operationSpans.map(span => span.attributes['method']?.value)).toEqual(OPERATION_METHODS);
  operationSpans.forEach(span => {
    expect(span.name).toBe('prisma:client:operation');
    expect(isInSegment(span)).toBe(true);
    expect(span.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.db.prisma', type: 'string' },
      'sentry.op': { value: 'db', type: 'string' },
      'db.operation.name': { value: span.attributes['method']?.value, type: 'string' },
      'db.collection.name': { value: 'user', type: 'string' },
      model: { value: 'User', type: 'string' },
      name: { value: `User.${span.attributes['method']?.value}`, type: 'string' },
    });
  });

  const queriesUnder = (method: string): unknown[] => {
    const operation = operationSpans.find(span => span.attributes['method']?.value === method)!;
    // `pg.connect` spans are `db` spans too, but carry no statement.
    return spans
      .filter(
        span =>
          getSpanOp(span) === 'db' &&
          span.attributes['db.query.text']?.value &&
          span.parent_span_id === operation.span_id,
      )
      .map(span => span.attributes['db.query.text']?.value);
  };
  expect(queriesUnder('create')).toEqual(
    expect.arrayContaining([expect.stringMatching(/^INSERT INTO "public"\."user" /)]),
  );
  expect(queriesUnder('all')).toEqual([expect.stringMatching(/^SELECT .* FROM "public"\."user"$/)]);
  expect(queriesUnder('delete')).toEqual(
    expect.arrayContaining([expect.stringMatching(/^DELETE FROM "public"\."user" /)]),
  );

  const dbSpans = spans.filter(span => getSpanOp(span) === 'db' && span.attributes['db.query.text']?.value);
  dbSpans.forEach(span => {
    expect(span.attributes['sentry.origin']?.value).toBe('auto.db.postgres');
    expect(span.attributes['db.system.name']?.value).toBe('postgresql');
    expect(span.parent_span_id).not.toBe(segment.span_id);
  });
});
