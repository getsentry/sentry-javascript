import { SENTRY_OP } from '@sentry/conventions/attributes';
import { MCP_NOTIFICATION_SERVER_TO_CLIENT } from '@sentry/conventions/op';
import type { SerializedStreamedSpan } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('MCP server trace injection into outgoing params._meta', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('lets the client continue the trace from an outgoing notification', async () => {
      const isNotification = (span: SerializedStreamedSpan): boolean =>
        span.attributes[SENTRY_OP]?.value === MCP_NOTIFICATION_SERVER_TO_CLIENT;
      const isClientSpan = (span: SerializedStreamedSpan): boolean =>
        span.attributes[SENTRY_OP]?.value === 'test.client';

      const runner = createTestRunner();
      // Both spans are separate segments and can arrive in different envelopes, so collect them across envelopes by trace.
      const spansPromise = runner.collectStreamedSpans(spans => spans.some(isNotification) && spans.some(isClientSpan));

      await runner.start().completed();

      const spans = await spansPromise;
      const notification = spans.find(isNotification)!;
      const clientSpan = spans.find(isClientSpan)!;
      expect(clientSpan.trace_id).toBe(notification.trace_id);
      expect(clientSpan.parent_span_id).toBe(notification.span_id);
    });
  });
});
