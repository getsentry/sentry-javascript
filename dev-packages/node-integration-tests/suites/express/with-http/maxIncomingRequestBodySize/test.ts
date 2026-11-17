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
  path?: string;
  body: { data: string };
  expectedBody?: string;
}

const configs: { name: string; instrument: string; cases: BodyCase[] }[] = [
  {
    name: 'default (medium)',
    instrument: 'instrument-default.mjs',
    cases: [
      { body: generatePayload(MAX_MEDIUM), expectedBody: JSON.stringify(generatePayload(MAX_MEDIUM)) },
      { body: generatePayload(MAX_MEDIUM + 1), expectedBody: generatePayloadString(MAX_MEDIUM, true) },
    ],
  },
  {
    name: 'small (overrides disabled httpBodies)',
    instrument: 'instrument-small.mjs',
    cases: [
      { body: generatePayload(MAX_SMALL), expectedBody: JSON.stringify(generatePayload(MAX_SMALL)) },
      { body: generatePayload(MAX_SMALL + 1), expectedBody: generatePayloadString(MAX_SMALL, true) },
      { body: generateEmojiPayload(MAX_SMALL + 1), expectedBody: generateEmojiPayloadString(250, true) },
    ],
  },
  {
    name: 'none',
    instrument: 'instrument-none.mjs',
    cases: [{ body: generatePayload(500) }, { path: '/ignore-request-body', body: generatePayload(500) }],
  },
  {
    name: 'always',
    instrument: 'instrument-always.mjs',
    cases: [
      { body: generatePayload(MAX_GENERAL), expectedBody: JSON.stringify(generatePayload(MAX_GENERAL)) },
      { body: generatePayload(MAX_GENERAL + 1), expectedBody: generatePayloadString(MAX_GENERAL, true) },
    ],
  },
  {
    name: 'medium',
    instrument: 'instrument-medium.mjs',
    cases: [
      { body: generatePayload(MAX_MEDIUM), expectedBody: JSON.stringify(generatePayload(MAX_MEDIUM)) },
      { body: generatePayload(MAX_MEDIUM + 1), expectedBody: generatePayloadString(MAX_MEDIUM, true) },
    ],
  },
];

describe.each(configs)('maxRequestBodySize: $name', ({ instrument, cases }) => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', instrument, (createRunner, test) => {
    test('applies the request body limit to each payload', async () => {
      const runner = createRunner().unordered();
      const spans = cases.map((_, index) =>
        runner.collectStreamedSpansUntilSegment(span => span.attributes['url.query']?.value === `case=${index}`),
      );
      const started = runner.start();

      for (const [index, { path = '/test-body-size', body, expectedBody }] of cases.entries()) {
        await started.makeRequest('post', `${path}?case=${index}`, {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(body),
        });
        const serverSpan = (await spans[index]!).find(span => span.is_segment);

        expect(serverSpan?.name, `${path}, case ${index}`).toBe(`POST ${path}`);
        expect(serverSpan?.attributes['http.request.body.data'], `${path}, case ${index}`).toEqual(
          expectedBody === undefined ? undefined : { type: 'string', value: expectedBody },
        );
      }
      await started.completed();
    });
  });
});
