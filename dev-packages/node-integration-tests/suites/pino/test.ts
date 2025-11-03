import { join } from 'path';
import { expect, test } from 'vitest';
import { conditionalTest } from '../../utils';
import { createRunner } from '../../utils/runner';

conditionalTest({ min: 20 })('Pino integration', () => {
  test('has different trace ids for logs from different spans', async () => {
    const instrumentPath = join(__dirname, 'instrument.mjs');

    await createRunner(__dirname, 'scenario.mjs')
      .withMockSentryServer()
      .withInstrument(instrumentPath)
      .ignore('event')
      .expect({
        log: log => {
          const traceId1 = log.items?.[0]?.trace_id;
          const traceId2 = log.items?.[1]?.trace_id;
          expect(traceId1).not.toBe(traceId2);
        },
      })
      .start()
      .completed();
  });

  test('captures event and logs', async () => {
    const instrumentPath = join(__dirname, 'instrument.mjs');

    await createRunner(__dirname, 'scenario.mjs')
      .withMockSentryServer()
      .withInstrument(instrumentPath)
      .expect({
        event: {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'oh no',
                mechanism: {
                  type: 'pino',
                  handled: true,
                },
                stacktrace: {
                  frames: expect.arrayContaining([
                    expect.objectContaining({
                      function: '?',
                      in_app: true,
                      module: 'scenario',
                    }),
                  ]),
                },
              },
            ],
          },
        },
      })
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'hello world',
              trace_id: expect.any(String),
              severity_number: 9,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                'pino.logger.level': { value: 30, type: 'integer' },
                user: { value: 'user-id', type: 'string' },
                something: {
                  type: 'string',
                  value: '{"more":3,"complex":"nope"}',
                },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'oh no',
              trace_id: expect.any(String),
              severity_number: 17,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                module: { value: 'authentication', type: 'string' },
                msg: { value: 'oh no', type: 'string' },
                err: { value: expect.any(String), type: 'string' },
                'pino.logger.level': { value: 50, type: 'integer' },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
          ],
        },
      })
      .start()
      .completed();
  });

  test('captures with Pino integrated channel', async () => {
    const instrumentPath = join(__dirname, 'instrument.mjs');

    await createRunner(__dirname, 'scenario-next.mjs')
      .withMockSentryServer()
      .withInstrument(instrumentPath)
      .expect({
        event: {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'oh no',
                mechanism: {
                  type: 'pino',
                  handled: true,
                },
                stacktrace: {
                  frames: expect.arrayContaining([
                    expect.objectContaining({
                      function: '?',
                      in_app: true,
                      module: 'scenario-next',
                      context_line: "      logger.error(new Error('oh no'));",
                    }),
                  ]),
                },
              },
            ],
          },
        },
      })
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'hello world',
              trace_id: expect.any(String),
              severity_number: 9,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                'pino.logger.level': { value: 30, type: 'integer' },
                user: { value: 'user-id', type: 'string' },
                something: {
                  type: 'string',
                  value: '{"more":3,"complex":"nope"}',
                },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'oh no',
              trace_id: expect.any(String),
              severity_number: 17,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                msg: { value: 'oh no', type: 'string' },
                err: { value: expect.any(String), type: 'string' },
                'pino.logger.level': { value: 50, type: 'integer' },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
          ],
        },
      })
      .start()
      .completed();
  });

  test('captures logs when autoInstrument is false and logger is tracked', async () => {
    const instrumentPath = join(__dirname, 'instrument-auto-off.mjs');

    await createRunner(__dirname, 'scenario-track.mjs')
      .withMockSentryServer()
      .withInstrument(instrumentPath)
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'hello world',
              trace_id: expect.any(String),
              severity_number: 9,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                'pino.logger.level': { value: 30, type: 'integer' },
                user: { value: 'user-id', type: 'string' },
                something: {
                  type: 'string',
                  value: '{"more":3,"complex":"nope"}',
                },
                msg: { value: 'hello world', type: 'string' },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'oh no',
              trace_id: expect.any(String),
              severity_number: 17,
              attributes: {
                name: { value: 'myapp', type: 'string' },
                module: { value: 'authentication', type: 'string' },
                msg: { value: 'oh no', type: 'string' },
                err: { value: expect.any(String), type: 'string' },
                'pino.logger.level': { value: 50, type: 'integer' },
                'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                'sentry.release': { value: '1.0', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
              },
            },
          ],
        },
      })
      .start()
      .completed();
  });
});
