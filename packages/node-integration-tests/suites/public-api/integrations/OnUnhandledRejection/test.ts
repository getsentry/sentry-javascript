import * as childProcess from 'child_process';
import * as path from 'path';

describe('OnUnhandledRejection integration', () => {
  test.each([
    { mode: 'none', additionalHandler: false, expectedErrorCode: 0 },
    { mode: 'warn', additionalHandler: false, expectedErrorCode: 0 },
    { mode: 'strict', additionalHandler: false, expectedErrorCode: 1 },

    { mode: 'none', additionalHandler: true, expectedErrorCode: 0 },
    { mode: 'warn', additionalHandler: true, expectedErrorCode: 0 },
    { mode: 'strict', additionalHandler: true, expectedErrorCode: 1 },
  ])(
    'should cause process to exit with code $expectedErrorCode with `mode` set to $mode while having a handler attached (? - $additionalHandler)',
    async ({ mode, additionalHandler, expectedErrorCode }) => {
      const testScriptPath = path.resolve(__dirname, 'test-script.js');

      await new Promise(resolve => {
        childProcess.exec(
          `node ${testScriptPath}`,
          {
            encoding: 'utf8',
            env: {
              PROMISE_REJECTION_MODE: mode ? String(mode) : undefined,
              ATTACH_ADDITIONAL_HANDLER: additionalHandler ? String(additionalHandler) : undefined,
            },
          },
          err => {
            expect(err?.code).toBe(expectedErrorCode || undefined);
            resolve();
          },
        );
      });
    },
  );
});
