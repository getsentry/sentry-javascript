import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send a manually started root span', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({ transaction: { transaction: 'test_span' } })
    .start(done);
});
