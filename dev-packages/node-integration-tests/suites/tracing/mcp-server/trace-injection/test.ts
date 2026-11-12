import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('MCP server trace injection into outgoing params._meta', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('lets the client continue the trace from an outgoing notification', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: container => {
            const notification = container.items.find(
              item => item.attributes['sentry.op']?.value === 'mcp.notification.server_to_client',
            );
            const clientSpan = container.items.find(item => item.attributes['sentry.op']?.value === 'test.client');
            expect(notification, 'expected the outgoing notification span').toBeDefined();
            expect(clientSpan, 'expected the client span').toBeDefined();
            expect(clientSpan!.trace_id).toBe(notification!.trace_id);
            expect(clientSpan!.parent_span_id).toBe(notification!.span_id);
          },
        })
        .start()
        .completed();
    });
  });
});
