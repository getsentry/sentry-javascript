import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Console Integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('filters console messages', async () => {
      const runner = createRunner()
        .expect({
          event: {
            exception: {
              values: [
                {
                  value: 'Test Error',
                },
              ],
            },
            breadcrumbs: [
              expect.objectContaining({
                message: 'hello',
              }),
              expect.objectContaining({
                message: 'baz',
              }),
            ],
          },
        })
        .start();

      await runner.completed();

      expect(runner.getLogs()).toContainEqual('hello');
      expect(runner.getLogs()).toContainEqual('baz');
      expect(runner.getLogs()).not.toContainEqual('foo');
      expect(runner.getLogs()).not.toContainEqual('foo2');

      // Ensure deprecation warnigns are not included
      expect(runner.getLogs()).not.toContainEqual(expect.stringMatching('DeprecationWarning'));
    });
  });
});
