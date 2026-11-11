import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('MCP server trace propagation via params._meta', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('continues the trace from the traceparent in params._meta', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: container => {
            const tool = container.items.find(
              item =>
                item.attributes['sentry.op']?.value === 'mcp.server' &&
                item.attributes['mcp.method.name']?.value === 'tools/call',
            );
            expect(tool, 'expected an mcp.server span for tools/call').toBeDefined();
            expect(tool!.name).toBe('tools/call echo');
            expect(tool!.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
            expect(tool!.parent_span_id).toBe('00f067aa0ba902b7');
          },
        })
        .start()
        .completed();
    });
  });
});
