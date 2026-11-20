import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, type createRunner } from '../../../../utils/runner';
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

function createBodyScenario(
  runnerFactory: () => ReturnType<typeof createRunner>,
  bodies: { data: string }[],
  paths = bodies.map(() => '/test-body-size'),
) {
  let scenario: ReturnType<typeof runScenario> | undefined;
  async function runScenario() {
    const runner = runnerFactory().unordered();
    const spans = bodies.map((_, index) =>
      runner.collectStreamedSpansUntilSegment(span => span.attributes['url.query']?.value === `case=${index}`),
    );
    const started = runner.start();
    for (const [index, body] of bodies.entries()) {
      await started.makeRequest('post', `${paths[index]}?case=${index}`, {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(body),
      });
    }
    await started.completed();
    return Promise.all(spans);
  }
  return async (index: number) => {
    scenario ??= runScenario();
    return { items: (await scenario)[index]! };
  };
}

describe('express with httpIntegration and not defined maxRequestBodySize', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-default.mjs', (createRunner, test) => {
    const getContainer = createBodyScenario(createRunner, [
      generatePayload(MAX_MEDIUM),
      generatePayload(MAX_MEDIUM + 1),
    ]);

    test('captures medium request bodies with default setting (medium)', async () => {
      const container = await getContainer(0);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: JSON.stringify(generatePayload(MAX_MEDIUM)) },
        }),
      });
    });

    test('truncates large request bodies with default setting (medium)', async () => {
      const container = await getContainer(1);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: generatePayloadString(MAX_MEDIUM, true) },
        }),
      });
    });
  });
});

describe('express with httpIntegration and maxRequestBodySize: "none"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-none.mjs', (createRunner, test) => {
    const getContainer = createBodyScenario(
      createRunner,
      [generatePayload(500), generatePayload(500)],
      ['/test-body-size', '/ignore-request-body'],
    );

    test('does not capture any request bodies with "none" setting', async () => {
      const container = await getContainer(0);
      const serverSpan = container.items.find(item => item.is_segment);
      expect(serverSpan?.name).toBe('POST /test-body-size');
      expect(serverSpan?.attributes['http.request.body.data']).toBeUndefined();
    });

    test('does not capture any request bodies with "none" setting and "ignoreRequestBody"', async () => {
      const container = await getContainer(0);
      const serverSpan = container.items.find(item => item.is_segment);
      expect(serverSpan?.name).toBe('POST /test-body-size');
      expect(serverSpan?.attributes['http.request.body.data']).toBeUndefined();
      const ignoredContainer = await getContainer(1);
      const ignoredServerSpan = ignoredContainer.items.find(item => item.is_segment);
      expect(ignoredServerSpan?.name).toBe('POST /ignore-request-body');
      expect(ignoredServerSpan?.attributes['http.request.body.data']).toBeUndefined();
    });
  });
});

describe('express with httpIntegration and maxRequestBodySize: "always"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-always.mjs', (createRunner, test) => {
    const getContainer = createBodyScenario(createRunner, [
      generatePayload(MAX_GENERAL),
      generatePayload(MAX_GENERAL + 1),
    ]);

    test('captures maximum allowed request body length with "always" setting', async () => {
      const container = await getContainer(0);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: JSON.stringify(generatePayload(MAX_GENERAL)) },
        }),
      });
    });

    test('captures large request bodies with "always" setting but respects maximum size limit', async () => {
      const container = await getContainer(1);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: generatePayloadString(MAX_GENERAL, true) },
        }),
      });
    });
  });
});

describe('express with httpIntegration and maxRequestBodySize: "small"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-small.mjs', (createRunner, test) => {
    const getContainer = createBodyScenario(createRunner, [
      generatePayload(MAX_SMALL),
      generatePayload(MAX_SMALL + 1),
      generateEmojiPayload(MAX_SMALL + 1),
    ]);

    test('captures request bodies because the explicit size overrides dataCollection.httpBodies', async () => {
      const container = await getContainer(0);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: JSON.stringify(generatePayload(MAX_SMALL)) },
        }),
      });
    });

    test('truncates too large request bodies with "small" setting', async () => {
      const container = await getContainer(1);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: generatePayloadString(MAX_SMALL, true) },
        }),
      });
    });

    test('truncates too large non-ASCII request bodies with "small" setting', async () => {
      const container = await getContainer(2);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          // 250 emojis, each 4 bytes in UTF-8 (resulting in 1000 bytes --> MAX_SMALL)
          'http.request.body.data': { type: 'string', value: generateEmojiPayloadString(250, true) },
        }),
      });
    });
  });
});

describe('express with httpIntegration and maxRequestBodySize: "medium"', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-medium.mjs', (createRunner, test) => {
    const getContainer = createBodyScenario(createRunner, [
      generatePayload(MAX_MEDIUM),
      generatePayload(MAX_MEDIUM + 1),
    ]);

    test('keeps medium request bodies with "medium" setting', async () => {
      const container = await getContainer(0);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: JSON.stringify(generatePayload(MAX_MEDIUM)) },
        }),
      });
    });

    test('truncates large request bodies with "medium" setting', async () => {
      const container = await getContainer(1);
      expect(container.items.find(item => item.is_segment)).toMatchObject({
        name: 'POST /test-body-size',
        attributes: expect.objectContaining({
          'http.request.body.data': { type: 'string', value: generatePayloadString(MAX_MEDIUM, true) },
        }),
      });
    });
  });
});
