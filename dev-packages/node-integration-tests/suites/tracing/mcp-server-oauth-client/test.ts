import {
  MCP_AUTH_CLIENT_NAME,
  MCP_CLIENT_NAME,
  MCP_METHOD_NAME,
  MCP_REQUEST_ID,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { MCP_SERVER } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('MCP OAuth client attribution', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  for (const { version, expectedRequests, additionalDependencies } of [
    {
      version: 'v1',
      expectedRequests: [
        ['discovery', 'initialize', 'Registered Discovery', 'protocol-v1'],
        ['context', 'tools/list', 'Registered Context', 'protocol-v1'],
        ['unsupported', 'resources/list', 'Registered Unsupported', 'protocol-v1'],
        ['missing', 'tools/list', undefined, 'protocol-v1'],
      ],
      additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' },
    },
    {
      version: 'v2',
      expectedRequests: [
        ['discovery', 'server/discover', 'Registered Discovery', 'protocol-discovery'],
        ['context', 'tools/list', 'Registered Context', 'protocol-context'],
        ['unsupported', 'resources/list', 'Registered Unsupported', 'protocol-unsupported'],
        ['missing', 'tools/list', undefined, undefined],
      ],
    },
  ]) {
    createEsmAndCjsTests(
      __dirname,
      `scenario-${version}.mjs`,
      'instrument.mjs',
      (createTestRunner, test) => {
        test(`keeps ${version} OAuth identity request-local and separate from MCP identity`, async () => {
          const runner = createTestRunner();
          const spansPromise = runner.collectStreamedSpans(
            spans =>
              spans.some(span => span.is_segment && span.name === 'oauth requests') &&
              expectedRequests.every(([id]) =>
                spans.some(
                  span =>
                    span.attributes[SENTRY_OP]?.value === MCP_SERVER && span.attributes[MCP_REQUEST_ID]?.value === id,
                ),
              ),
          );

          await runner.start().completed();

          const spans = await spansPromise;
          const root = spans.find(span => span.is_segment && span.name === 'oauth requests');
          expect(root?.attributes['test.responses.checked']?.value).toBe(true);
          const requests = spans.filter(
            span => span.attributes[SENTRY_OP]?.value === MCP_SERVER && span.attributes[MCP_REQUEST_ID],
          );
          expect(requests).toHaveLength(expectedRequests.length);
          expect(
            requests.map(({ attributes }) => [
              attributes[MCP_REQUEST_ID]?.value,
              attributes[MCP_METHOD_NAME]?.value,
              attributes[MCP_AUTH_CLIENT_NAME]?.value,
              attributes[MCP_CLIENT_NAME]?.value,
            ]),
          ).toEqual(expect.arrayContaining(expectedRequests));
          expect(JSON.stringify(spans)).not.toContain('Notification Client');
        });
      },
      { additionalDependencies },
    );
  }
});
