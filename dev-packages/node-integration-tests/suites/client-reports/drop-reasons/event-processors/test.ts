import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should record client report for event processors', done => {
  createRunner(__dirname, 'scenario.ts')
    .unignore('client_report')
    .expect({
      client_report: {
        discarded_events: [
          {
            category: 'error',
            quantity: 1,
            reason: 'event_processor',
          },
        ],
      },
    })
    .expect({
      client_report: {
        discarded_events: [
          {
            category: 'error',
            quantity: 2,
            reason: 'event_processor',
          },
        ],
      },
    })
    .start(done);
});
