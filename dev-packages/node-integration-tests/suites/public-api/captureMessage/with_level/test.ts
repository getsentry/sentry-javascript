import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture with different severity levels', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({ event: { message: 'debug_message', level: 'debug' } })
    .expect({ event: { message: 'info_message', level: 'info' } })
    .expect({ event: { message: 'warning_message', level: 'warning' } })
    .expect({ event: { message: 'error_message', level: 'error' } })
    .expect({ event: { message: 'fatal_message', level: 'fatal' } })
    .expect({ event: { message: 'log_message', level: 'log' } })
    .start(done);
});
