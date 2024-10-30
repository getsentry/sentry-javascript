import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

const EXPECTED_EVENT = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Test error in child process',
      },
    ],
  },
};

test('handleTunnelEnvelope should forward envelopes', done => {
  createRunner(__dirname, 'server.mjs')
    .expect({
      event: EXPECTED_EVENT,
    })
    .start(done);
});
