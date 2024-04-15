import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

const { TS_VERSION } = process.env;
const isOldTS = TS_VERSION && TS_VERSION.startsWith('3.');

// This is required to run the test with ts-node and decorators
process.env.TS_NODE_PROJECT = `${__dirname}/tsconfig.json`;

conditionalTest({ min: 16 })('nestjs auto instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  test("should assign scope's transactionName if spans are not sampled and express integration is disabled", done => {
    if (isOldTS) {
      // Skipping test on old TypeScript
      return done();
    }

    createRunner(__dirname, 'scenario.ts')
      .expect({
        event: {
          exception: {
            values: [
              {
                value: 'error with id 456',
              },
            ],
          },
          transaction: 'GET /test-exception/:id',
        },
      })
      .start(done)
      .makeRequest('get', '/test-exception/456');
  });
});
