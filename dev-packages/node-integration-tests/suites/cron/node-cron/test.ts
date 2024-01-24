import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('node-cron types should match', done => {
  createRunner(__dirname, 'scenario.ts').ensureNoErrorOutput().start(done);
});
