import { MCP_METHOD_NAME, SENTRY_OP } from '@sentry/conventions/attributes';
import { MCP_NOTIFICATION_SERVER_TO_CLIENT, MCP_SERVER } from '@sentry/conventions/op';
import type { SerializedStreamedSpan } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('MCP server trace injection into outgoing params._meta', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('lets the client continue the trace from outgoing notifications and requests', async () => {
      const isToolCall = (span: SerializedStreamedSpan): boolean =>
        span.attributes[SENTRY_OP]?.value === MCP_SERVER && span.attributes[MCP_METHOD_NAME]?.value === 'tools/call';
      const isNotification = (span: SerializedStreamedSpan): boolean =>
        span.attributes[SENTRY_OP]?.value === MCP_NOTIFICATION_SERVER_TO_CLIENT;
      const isLogHandler = (span: SerializedStreamedSpan): boolean => span.name === 'handle log message';
      const isElicitationHandler = (span: SerializedStreamedSpan): boolean => span.name === 'handle elicitation';

      const runner = createTestRunner();
      // The spans are separate segments and can arrive in different envelopes, so collect them across envelopes by trace.
      const spansPromise = runner.collectStreamedSpans(
        spans =>
          spans.some(isToolCall) &&
          spans.some(isNotification) &&
          spans.some(isLogHandler) &&
          spans.some(isElicitationHandler),
      );

      await runner.start().completed();

      const spans = await spansPromise;
      const toolCall = spans.find(isToolCall)!;
      const notification = spans.find(isNotification)!;
      const logHandler = spans.find(isLogHandler)!;
      const elicitationHandler = spans.find(isElicitationHandler)!;

      expect(notification.parent_span_id).toBe(toolCall.span_id);
      expect(logHandler.trace_id).toBe(toolCall.trace_id);
      expect(logHandler.parent_span_id).toBe(notification.span_id);
      expect(elicitationHandler.trace_id).toBe(toolCall.trace_id);
      expect(elicitationHandler.parent_span_id).toBe(toolCall.span_id);
    });
  });
});
