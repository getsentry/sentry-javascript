import type { SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

function getSegment(container: SerializedStreamedSpanContainer): SerializedStreamedSpan {
  const segment = container.items.find(item => item.is_segment);
  expect(segment?.name).toBe('Test Transaction');
  return segment!;
}

function getQuerySpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpan[] {
  const querySpans = container.items.filter(
    item => item.attributes['sentry.origin']?.value === 'auto.db.postgres' && item.attributes['db.query.text']?.value,
  );
  expect(querySpans.map(span => span.name)).toEqual(
    expect.arrayContaining(['INSERT "public"."user"', 'SELECT "public"."user"', 'DELETE "public"."user"']),
  );
  querySpans.forEach(span => {
    expect(span.attributes['sentry.op']?.value).toBe('db');
    expect(span.attributes['db.system.name']?.value).toBe('postgresql');
  });
  return querySpans;
}

function getOperationSpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpan[] {
  return container.items.filter(item => item.attributes['sentry.origin']?.value === 'auto.db.prisma');
}

// Prisma 8 has no tracing surface: the operation spans come from the orchestrion channels the runtime hook
// injects, and the `pg` spans underneath stand in for v7's `db_query` spans.
describe('Prisma ORM v8 Tests', () => {
  describeWithDockerCompose('Prisma ORM v8', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createRunner, test, mode) => {
        const testInstrumentedOperations = (): void => {
          test('should instrument Prisma ORM operations and nest their queries', { timeout: 75_000 }, async () => {
            await createRunner()
              .unordered()
              .expect({
                span: container => {
                  const segment = getSegment(container);
                  const querySpans = getQuerySpans(container);
                  const operationSpans = getOperationSpans(container);

                  expect(operationSpans.map(span => span.name)).toEqual([
                    'prisma:client:operation',
                    'prisma:client:operation',
                    'prisma:client:operation',
                  ]);
                  expect(operationSpans.map(span => span.attributes['method']?.value)).toEqual([
                    'create',
                    'all',
                    'delete',
                  ]);
                  operationSpans.forEach(span => {
                    const method = span.attributes['method']?.value;
                    expect(span.parent_span_id).toBe(segment.span_id);
                    expect(span.attributes).toMatchObject({
                      'sentry.origin': { value: 'auto.db.prisma', type: 'string' },
                      'sentry.op': { value: 'db', type: 'string' },
                      'db.operation.name': { value: method, type: 'string' },
                      'db.collection.name': { value: 'user', type: 'string' },
                      model: { value: 'User', type: 'string' },
                      name: { value: `User.${method}`, type: 'string' },
                    });
                  });

                  const queriesByOperation = (method: string): unknown[] => {
                    const operation = operationSpans.find(span => span.attributes['method']?.value === method);
                    return querySpans
                      .filter(span => span.parent_span_id === operation?.span_id)
                      .map(span => span.attributes['db.query.text']?.value);
                  };
                  expect(queriesByOperation('create')).toEqual(
                    expect.arrayContaining([expect.stringMatching(/^INSERT INTO "public"\."user" /)]),
                  );
                  expect(queriesByOperation('all')).toEqual([
                    expect.stringMatching(/^SELECT .* FROM "public"\."user"$/),
                  ]);
                  expect(queriesByOperation('delete')).toEqual(
                    expect.arrayContaining([expect.stringMatching(/^DELETE FROM "public"\."user" /)]),
                  );
                  expect(querySpans.filter(span => span.parent_span_id === segment.span_id)).toEqual([]);
                },
              })
              .start()
              .completed();
          });
        };

        if (mode === 'esm') {
          testInstrumentedOperations();
          return;
        }

        // The CJS scenario loads the ESM-only package via `require(esm)`, which Node's module hooks only see
        // from Node 22 on; on Node 20 the ORM terminals load uninstrumented.
        conditionalTest({ min: 22 })('with require(esm) reaching the module hooks', testInstrumentedOperations);

        conditionalTest({ max: 21 })('with require(esm) bypassing the module hooks', () => {
          test('should keep the pg spans on the transaction', { timeout: 75_000 }, async () => {
            await createRunner()
              .unordered()
              .expect({
                span: container => {
                  const segment = getSegment(container);
                  expect(getOperationSpans(container)).toEqual([]);
                  getQuerySpans(container).forEach(span => expect(span.parent_span_id).toBe(segment.span_id));
                },
              })
              .start()
              .completed();
          });
        });
      },
      {
        additionalDependencies: {
          '@prisma/orm-postgres': '8.0.0-rc.8',
        },
        copyPaths: ['prisma'],
      },
    );
  });
});
