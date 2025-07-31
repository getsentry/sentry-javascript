import { join } from 'path';
import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('ContextLines integration in ESM', () => {
  test('reads encoded context lines from filenames with spaces', async () => {
    expect.assertions(1);
    const instrumentPath = join(__dirname, 'instrument.mjs');

    await createRunner(__dirname, 'scenario with space.mjs')
      .withInstrument(instrumentPath)
      .expect({
        event: {
          exception: {
            values: [
              {
                value: 'Test Error',
                stacktrace: {
                  frames: expect.arrayContaining([
                    {
                      filename: expect.stringMatching(/\/scenario with space.mjs$/),
                      context_line: "Sentry.captureException(new Error('Test Error'));",
                      pre_context: ["import * as Sentry from '@sentry/node-core';", ''],
                      post_context: ['', '// some more post context'],
                      colno: 25,
                      lineno: 3,
                      function: '?',
                      in_app: true,
                      module: 'scenario with space',
                    },
                  ]),
                },
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });
});

describe('ContextLines integration in CJS', () => {
  test('reads context lines from filenames with spaces', async () => {
    expect.assertions(1);

    await createRunner(__dirname, 'scenario with space.cjs')
      .expect({
        event: {
          exception: {
            values: [
              {
                value: 'Test Error',
                stacktrace: {
                  frames: expect.arrayContaining([
                    {
                      filename: expect.stringMatching(/\/scenario with space.cjs$/),
                      context_line: "Sentry.captureException(new Error('Test Error'));",
                      pre_context: [
                        '',
                        'Sentry.init({',
                        "  dsn: 'https://public@dsn.ingest.sentry.io/1337',",
                        "  release: '1.0',",
                        '  transport: loggingTransport,',
                        '});',
                        '',
                      ],
                      post_context: ['', '// some more post context'],
                      colno: 25,
                      lineno: 10,
                      function: 'Object.?',
                      in_app: true,
                      module: 'scenario with space',
                    },
                  ]),
                },
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });
});
