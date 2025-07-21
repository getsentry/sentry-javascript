import * as path from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

// This test takes some time because it connects the debugger etc.
// So we increase the timeout here
// vi.setTimeout(45_000);

const EXPECTED_LOCAL_VARIABLES_EVENT = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: expect.arrayContaining([
            expect.objectContaining({
              function: 'one',
              vars: {
                name: 'some name',
                arr: [1, '2', null],
                obj: { name: 'some name', num: 5 },
                ty: '<Some>',
                bool: false,
                num: 0,
                str: '',
                something: '<undefined>',
                somethingElse: '<null>',
              },
            }),
            expect.objectContaining({
              function: 'Some.two',
              vars: { name: 'some name' },
            }),
          ]),
        },
      },
    ],
  },
};

describe('LocalVariables integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('Should not include local variables by default', async () => {
    await createRunner(__dirname, 'no-local-variables.js')
      .expect({
        event: event => {
          for (const frame of event.exception?.values?.[0]?.stacktrace?.frames || []) {
            expect(frame.vars).toBeUndefined();
          }
        },
      })
      .start()
      .completed();
  });

  test('Should include local variables when enabled', async () => {
    await createRunner(__dirname, 'local-variables.js')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });

  test('Should include local variables when instrumenting via --require', async () => {
    const requirePath = path.resolve(__dirname, 'local-variables-instrument.js');

    await createRunner(__dirname, 'local-variables-no-sentry.js')
      .withFlags(`--require=${requirePath}`)
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });

  test('Should include local variables with ESM', async () => {
    await createRunner(__dirname, 'local-variables-caught.mjs')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });

  conditionalTest({ min: 19 })('Node v19+', () => {
    test('Should not import inspector when not in use', async () => {
      await createRunner(__dirname, 'deny-inspector.mjs').ensureNoErrorOutput().start().completed();
    });
  });

  conditionalTest({ min: 20 })('Node v20+', () => {
    test('Should retain original local variables when error is re-thrown', async () => {
      await createRunner(__dirname, 'local-variables-rethrow.js')
        .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
        .start()
        .completed();
    });
  });

  test('Includes local variables for caught exceptions when enabled', async () => {
    await createRunner(__dirname, 'local-variables-caught.js')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });
});
