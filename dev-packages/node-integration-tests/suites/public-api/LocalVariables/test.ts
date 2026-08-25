import { mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

// This test takes some time because it connects the debugger etc.
// So we increase the timeout here
// vi.setTimeout(45_000);

function findFrameByFunctionName(frames: Array<{ function?: string }>, functionName: string) {
  return frames.find(frame => frame.function === functionName || frame.function === `Object.${functionName}`);
}

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
  const nodeModules = `${__dirname}/node_modules`;
  const externalModule = `${nodeModules}//out-of-app-function.js`;
  function cleanupExternalModuleFile() {
    try {
      unlinkSync(externalModule);
      // eslint-disable-next-line no-empty
    } catch {}
    try {
      rmdirSync(nodeModules);
      // eslint-disable-next-line no-empty
    } catch {}
  }

  beforeAll(() => {
    cleanupExternalModuleFile();
    mkdirSync(nodeModules, { recursive: true });
    writeFileSync(
      externalModule,
      `
function out_of_app_function(passedArg) {
  const outOfAppVar = "out of app value " + passedArg.substring(13);
  throw new Error("out-of-app error");
}
module.exports = { out_of_app_function };`,
    );
  });
  afterAll(() => {
    cleanupChildProcesses();
    cleanupExternalModuleFile();
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

  test('Should include local variables when instrumenting via --import', async () => {
    const instrumentPath = path.resolve(__dirname, 'local-variables-instrument.cjs');

    await createRunner(__dirname, 'local-variables-no-sentry.js')
      .withFlags(`--import=${instrumentPath}`)
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

  test('Should not import inspector when not in use', async () => {
    await createRunner(__dirname, 'deny-inspector.mjs').ensureNoErrorOutput().start().completed();
  });

  test('Should retain original local variables when error is re-thrown', async () => {
    await createRunner(__dirname, 'local-variables-rethrow.js')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });

  test('Includes local variables for caught exceptions when enabled', async () => {
    await createRunner(__dirname, 'local-variables-caught.js')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start()
      .completed();
  });

  test('Filters local variables by name via dataCollection.stackFrameVariables', async () => {
    await createRunner(__dirname, 'local-variables-filtered.js')
      .expect({
        event: event => {
          const frame = event.exception?.values?.[0]?.stacktrace?.frames?.find(frame => frame.function === 'one');

          expect(frame?.vars).toEqual({
            name: 'some name',
            keepVar: 'keep me',
            secretVar: '[Filtered]',
          });
        },
      })
      .start()
      .completed();
  });

  test('Does not attach local variables when dataCollection.stackFrameVariables is false', async () => {
    await createRunner(__dirname, 'local-variables-disabled.js')
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

  test('Should handle different function name formats', async () => {
    await createRunner(__dirname, 'local-variables-name-matching.js')
      .expect({
        event: {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: expect.arrayContaining([
                    expect.objectContaining({
                      function: expect.stringMatching(/^(Object\.testSentry|testSentry)$/),
                      vars: expect.objectContaining({
                        args: expect.any(Object),
                      }),
                    }),
                  ]),
                },
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });

  test('adds local variables to out of app frames when includeOutOfAppFrames is true', async () => {
    await createRunner(__dirname, 'local-variables-out-of-app.js')
      .expect({
        event: event => {
          const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];

          const inAppFrame = findFrameByFunctionName(frames, 'in_app_function');
          const outOfAppFrame = findFrameByFunctionName(frames, 'out_of_app_function');

          expect(inAppFrame).toBeDefined();
          expect(inAppFrame?.vars).toEqual({ inAppVar: 'in app value' });
          expect(inAppFrame?.in_app).toEqual(true);

          expect(outOfAppFrame).toBeDefined();
          expect(outOfAppFrame?.vars).toEqual({
            outOfAppVar: 'out of app value modified value',
            passedArg: 'in app value modified value',
          });
          expect(outOfAppFrame?.in_app).toEqual(false);
        },
      })
      .start()
      .completed();
  });

  test('does not add local variables to out of app frames by default', async () => {
    await createRunner(__dirname, 'local-variables-out-of-app-default.js')
      .expect({
        event: event => {
          const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];

          const inAppFrame = findFrameByFunctionName(frames, 'in_app_function');
          const outOfAppFrame = findFrameByFunctionName(frames, 'out_of_app_function');

          expect(inAppFrame).toBeDefined();
          expect(inAppFrame?.vars).toEqual({ inAppVar: 'in app value' });
          expect(inAppFrame?.in_app).toEqual(true);

          expect(outOfAppFrame).toBeDefined();
          expect(outOfAppFrame?.vars).toBeUndefined();
          expect(outOfAppFrame?.in_app).toEqual(false);
        },
      })
      .start()
      .completed();
  });
});
