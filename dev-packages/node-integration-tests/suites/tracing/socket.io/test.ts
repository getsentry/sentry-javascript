import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('socket.io auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `socket.io` package with express server', done => {
    const SERVER_TRANSACTION = {
      transaction: 'GET /',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.socket.otel.producer',
            'messaging.destination': '/',
            'messaging.destination_kind': 'topic',
            'messaging.socket.io.event_name': 'test',
            'messaging.socket.io.namespace': '/',
            'messaging.system': 'socket.io',
            'otel.kind': 'PRODUCER',
            'sentry.op': 'message',
          },
          origin: 'auto.socket.otel.producer',
          description: '/ send',
          op: 'message',
          status: 'ok',
        }),
      ]),
    };

    const CLIENT_TRANSACTION = {
      transaction: 'test_reply receive',
      contexts: {
        trace: expect.objectContaining({
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: expect.objectContaining({
            'sentry.op': 'message',
            'sentry.origin': 'auto.socket.otel.consumer',
            'otel.kind': 'CONSUMER',
            'messaging.system': 'socket.io',
            'messaging.destination': '/',
            'messaging.operation': 'receive',
            'messaging.socket.io.event_name': 'test_reply',
          }),
          origin: 'auto.socket.otel.consumer',
          op: 'message',
          status: 'ok',
        }),
      },
    };

    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: SERVER_TRANSACTION })
      .expect({ transaction: CLIENT_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });
});
