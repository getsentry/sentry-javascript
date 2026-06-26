import { join } from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

// See ./README.md in this test folder for details about requirements
// to un-skip this test.
describe.skip('nestjs orchestrion auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const INSTRUMENT = join(__dirname, 'instrument-orchestrion.mjs');

  test('emits the app_creation transaction at startup', async () => {
    await createRunner(__dirname, 'scenario.ts')
      .withFlags('--import', INSTRUMENT)
      .expect({
        transaction: transaction => {
          expect(transaction.transaction).toBe('Create Nest App');
          expect(transaction.contexts?.trace?.op).toBe('app_creation.nestjs');
          expect(transaction.contexts?.trace?.origin).toBe('auto.http.otel.nestjs');
          expect(transaction.contexts?.trace?.data).toEqual(
            expect.objectContaining({
              'component': '@nestjs/core',
              'nestjs.type': 'app_creation',
              'nestjs.module': 'AppModule',
            }),
          );
        },
      })
      .start()
      .completed();
  });

  test('a route transaction nests request_context + handler spans', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withFlags('--import', INSTRUMENT)
      .expect({
        transaction: transaction => {
          expect(transaction.transaction).toBe('GET /test-transaction');
          const spans = transaction.spans ?? [];
          expect(
            spans.find(span => span.op === 'request_context.nestjs' && span.origin === 'auto.http.otel.nestjs'),
            'expected a request_context.nestjs span',
          ).toBeDefined();
          expect(
            spans.find(span => span.op === 'handler.nestjs'),
            'expected a handler.nestjs span',
          ).toBeDefined();
        },
      })
      .start();

    runner.makeRequest('get', '/test-transaction');
    await runner.completed();
  });
});
