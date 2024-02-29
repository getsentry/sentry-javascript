import * as childProcess from 'child_process';
import * as path from 'path';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

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

conditionalTest({ min: 18 })('LocalVariables integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('Should not include local variables by default', done => {
    createRunner(__dirname, 'no-local-variables.js')
      .ignore('session')
      .expect({
        event: event => {
          for (const frame of event.exception?.values?.[0].stacktrace?.frames || []) {
            expect(frame.vars).toBeUndefined();
          }
        },
      })
      .start(done);
  });

  test('Should include local variables when enabled', done => {
    createRunner(__dirname, 'local-variables.js')
      .ignore('session')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start(done);
  });

  test('Should include local variables with ESM', done => {
    createRunner(__dirname, 'local-variables-caught.mjs')
      .ignore('session')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start(done);
  });

  test('Includes local variables for caught exceptions when enabled', done => {
    createRunner(__dirname, 'local-variables-caught.js')
      .ignore('session')
      .expect({ event: EXPECTED_LOCAL_VARIABLES_EVENT })
      .start(done);
  });

  test('Should not leak memory', done => {
    const testScriptPath = path.resolve(__dirname, 'local-variables-memory-test.js');

    const child = childProcess.spawn('node', [testScriptPath], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let reportedCount = 0;

    child.on('message', msg => {
      reportedCount++;
      const rssMb = msg.memUsage.rss / 1024 / 1024;
      // We shouldn't use more than 120MB of memory
      expect(rssMb).toBeLessThan(120);
    });

    // Wait for 20 seconds
    setTimeout(() => {
      // Ensure we've had memory usage reported at least 15 times
      expect(reportedCount).toBeGreaterThan(15);
      child.kill();
      done();
    }, 20000);
  });
});
