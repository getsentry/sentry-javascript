import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import {
  generateEmojiPayload,
  generateEmojiPayloadString,
  generatePayload,
  generatePayloadString,
} from './generatePayload';

// Value of MAX_BODY_BYTE_LENGTH in SentryHttpIntegration
const MAX_GENERAL = 1024 * 1024; // 1MB
const MAX_MEDIUM = 10_000;
const MAX_SMALL = 1000;

describe('express with httpIntegration and not defined maxIncomingRequestBodySize', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-default.mjs', (createRunner, test) => {
    test('captures medium request bodies with default setting (medium)', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'POST /test-body-size',
            request: {
              data: JSON.stringify(generatePayload(MAX_MEDIUM)),
            },
          },
        })
        .start();

      await runner.makeRequest('post', '/test-body-size', {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(generatePayload(MAX_MEDIUM)),
      });

      await runner.completed();
    });

    test('truncates large request bodies with default setting (medium)', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'POST /test-body-size',
            request: {
              data: generatePayloadString(MAX_MEDIUM, true),
            },
          },
        })
        .start();

      await runner.makeRequest('post', '/test-body-size', {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(generatePayload(MAX_MEDIUM + 1)),
      });

      await runner.completed();
    });
  });
});

describe('express with httpIntegration and maxIncomingRequestBodySize: "none"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-none.mjs',
    (createRunner, test) => {
      test('does not capture any request bodies with "none" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: expect.not.objectContaining({
                data: expect.any(String),
              }),
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(500)),
        });

        await runner.completed();
      });

      test('does not capture any request bodies with "none" setting and "ignoreIncomingRequestBody"', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: expect.not.objectContaining({
                data: expect.any(String),
              }),
            },
          })
          .expect({
            transaction: {
              transaction: 'POST /ignore-request-body',
              request: expect.not.objectContaining({
                data: expect.any(String),
              }),
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(500)),
        });

        await runner.makeRequest('post', '/ignore-request-body', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(500)),
        });

        await runner.completed();
      });
    },
    { failsOnEsm: false },
  );
});

describe('express with httpIntegration and maxIncomingRequestBodySize: "always"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-always.mjs',
    (createRunner, test) => {
      test('captures maximum allowed request body length with "always" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: JSON.stringify(generatePayload(MAX_GENERAL)),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_GENERAL)),
        });

        await runner.completed();
      });

      test('captures large request bodies with "always" setting but respects maximum size limit', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: generatePayloadString(MAX_GENERAL, true),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_GENERAL + 1)),
        });

        await runner.completed();
      });
    },
    { failsOnEsm: false },
  );
});

describe('express with httpIntegration and maxIncomingRequestBodySize: "small"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-small.mjs',
    (createRunner, test) => {
      test('keeps small request bodies with "small" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: JSON.stringify(generatePayload(MAX_SMALL)),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_SMALL)),
        });

        await runner.completed();
      });

      test('truncates too large request bodies with "small" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: generatePayloadString(MAX_SMALL, true),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_SMALL + 1)),
        });

        await runner.completed();
      });

      test('truncates too large non-ASCII request bodies with "small" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                // 250 emojis, each 4 bytes in UTF-8 (resulting in 1000 bytes --> MAX_SMALL)
                data: generateEmojiPayloadString(250, true),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generateEmojiPayload(MAX_SMALL + 1)),
        });

        await runner.completed();
      });
    },
    { failsOnEsm: false },
  );
});

describe('express with httpIntegration and maxIncomingRequestBodySize: "medium"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-medium.mjs',
    (createRunner, test) => {
      test('keeps medium request bodies with "medium" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: JSON.stringify(generatePayload(MAX_MEDIUM)),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_MEDIUM)),
        });

        await runner.completed();
      });

      test('truncates large request bodies with "medium" setting', async () => {
        const runner = createRunner()
          .expect({
            transaction: {
              transaction: 'POST /test-body-size',
              request: {
                data: generatePayloadString(MAX_MEDIUM, true),
              },
            },
          })
          .start();

        await runner.makeRequest('post', '/test-body-size', {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(generatePayload(MAX_MEDIUM + 1)),
        });

        await runner.completed();
      });
    },
    { failsOnEsm: false },
  );
});
