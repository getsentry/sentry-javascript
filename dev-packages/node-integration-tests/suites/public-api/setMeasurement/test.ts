import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should attach measurement to transaction', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'some_transaction',
        measurements: {
          'metric.foo': { value: 42, unit: 'ms' },
          'metric.bar': { value: 1337, unit: 'nanoseconds' },
          'metric.baz': { value: 1, unit: '' },
        },
      },
    })
    .start(done);
});
