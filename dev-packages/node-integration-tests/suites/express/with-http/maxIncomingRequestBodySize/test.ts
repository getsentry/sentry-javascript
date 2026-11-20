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

interface BodyCase {
  name: string;
  path?: string;
  body: { data: string };
  expectedBody?: string;
}

const configs: { name: string; instrument: string; cases: BodyCase[] }[] = [
  {
    name: 'default (medium)',
    instrument: 'instrument-default.mjs',
    cases: [
      {
        name: 'captures medium request bodies with default setting (medium)',
        body: generatePayload(MAX_MEDIUM),
        expectedBody: JSON.stringify(generatePayload(MAX_MEDIUM)),
      },
      {
        name: 'truncates large request bodies with default setting (medium)',
        body: generatePayload(MAX_MEDIUM + 1),
        expectedBody: generatePayloadString(MAX_MEDIUM, true),
      },
    ],
  },
  {
    name: 'small (overrides disabled httpBodies)',
    instrument: 'instrument-small.mjs',
    cases: [
      {
        name: 'captures request bodies because the explicit size overrides dataCollection.httpBodies',
        body: generatePayload(MAX_SMALL),
        expectedBody: JSON.stringify(generatePayload(MAX_SMALL)),
      },
      {
        name: 'truncates too large request bodies with "small" setting',
        body: generatePayload(MAX_SMALL + 1),
        expectedBody: generatePayloadString(MAX_SMALL, true),
      },
      {
        name: 'truncates too large non-ASCII request bodies with "small" setting',
        body: generateEmojiPayload(MAX_SMALL + 1),
        expectedBody: generateEmojiPayloadString(250, true),
      },
    ],
  },
  {
    name: 'none',
    instrument: 'instrument-none.mjs',
    cases: [
      { name: 'does not capture any request bodies with "none" setting', body: generatePayload(500) },
      {
        name: 'does not capture any request bodies with "none" setting and "ignoreRequestBody"',
        path: '/ignore-request-body',
        body: generatePayload(500),
      },
    ],
  },
  {
    name: 'always',
    instrument: 'instrument-always.mjs',
    cases: [
      {
        name: 'captures maximum allowed request body length with "always" setting',
        body: generatePayload(MAX_GENERAL),
        expectedBody: JSON.stringify(generatePayload(MAX_GENERAL)),
      },
      {
        name: 'captures large request bodies with "always" setting but respects maximum size limit',
        body: generatePayload(MAX_GENERAL + 1),
        expectedBody: generatePayloadString(MAX_GENERAL, true),
      },
    ],
  },
  {
    name: 'medium',
    instrument: 'instrument-medium.mjs',
    cases: [
      {
        name: 'keeps medium request bodies with "medium" setting',
        body: generatePayload(MAX_MEDIUM),
        expectedBody: JSON.stringify(generatePayload(MAX_MEDIUM)),
      },
      {
        name: 'truncates large request bodies with "medium" setting',
        body: generatePayload(MAX_MEDIUM + 1),
        expectedBody: generatePayloadString(MAX_MEDIUM, true),
      },
    ],
  },
];

describe.each(configs)('maxRequestBodySize: $name', ({ instrument, cases }) => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', instrument, (createRunner, test) => {
    let scenario: ReturnType<typeof runScenario> | undefined;
    async function runScenario() {
      const runner = createRunner().unordered();
      const spans = cases.map((_, index) =>
        runner.collectStreamedSpansUntilSegment(span => span.attributes['url.query']?.value === `case=${index}`),
      );
      const started = runner.start();

      for (const [index, { path = '/test-body-size', body }] of cases.entries()) {
        await started.makeRequest('post', `${path}?case=${index}`, {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(body),
        });
      }
      await started.completed();
      return Promise.all(spans);
    }

    test.each(cases.map((entry, index) => ({ ...entry, index })))(
      '$name',
      async ({ index, path = '/test-body-size', expectedBody }) => {
        scenario ??= runScenario();
        const serverSpan = (await scenario)[index]!.find(span => span.is_segment);
        expect(serverSpan?.name).toBe(`POST ${path}`);
        expect(serverSpan?.attributes['http.request.body.data']).toEqual(
          expectedBody === undefined ? undefined : { type: 'string', value: expectedBody },
        );
      },
    );
  });
});
