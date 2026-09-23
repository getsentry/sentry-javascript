import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../utils/runner';

describe.each(['v1', 'v2'])('MCP TypeScript SDK %s', sdk => {
  createEsmAndCjsTests(
    __dirname,
    `scenario-sdk-${sdk}.mjs`,
    'instrument.mjs',
    (createTestRunner, test) => {
      test('preserves handler errors without repeating their side effects', async () => {
        let root: SerializedStreamedSpanContainer['items'][number] | undefined;

        await createTestRunner()
          .unordered()
          .expect({
            event: event => {
              expect(event.exception?.values).toHaveLength(1);
              expect(event.exception?.values?.[0]?.value).toBe('tool failed');
              expect(event.exception?.values?.[0]?.mechanism?.type).toBe('auto.ai.mcp_server');
            },
          })
          .expect({
            span: container => {
              const segment = container.items.find(item => item.is_segment && item.name === 'handler-regression');
              expect(segment?.name).toBe('handler-regression');
              root = segment;
            },
          })
          .start()
          .completed();

        expect(root?.status).toBe('ok');
        expect(root?.attributes['test.mcp.handlers_verified']).toEqual({ type: 'integer', value: 4 });
      });
    },
    {
      additionalDependencies: sdk === 'v1' ? { '@modelcontextprotocol/sdk': '1.30.0' } : undefined,
      copyPaths: ['run.cjs'],
    },
  );
});
