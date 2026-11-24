import { GEN_AI_TOOL_CALL_RESULT } from '@sentry/conventions/attributes';

import { afterAll, describe, expect } from 'vitest';

import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

// The pi packages declare `engines.node >= 22.19`.
describe.runIf(supports({ min: 22 }))('pi-durable integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(__dirname, 'scenario-tools.mjs', 'instrument.mjs', (createRunner, test) => {
    test('reports app tool failures but not failures of the built-in coding tools', async () => {
      const appErrors: unknown[] = [];

      // Ordered, with spans ignored: a captured failure of the built-in `bash` tool would be an
      // extra event before the sentinel, which the scenario sends once everything else is sent.
      // The two app failures are processed concurrently, so they may arrive in either order.
      await createRunner()
        .ignore('span')
        .expect({
          event: event => {
            expect(['app read failed', 'Intentional pi-durable tool failure']).toContain(
              event.exception?.values?.[0]?.value,
            );
            appErrors.push(event.exception?.values?.[0]?.value);
          },
        })
        .expect({
          event: event => {
            expect(['app read failed', 'Intentional pi-durable tool failure']).toContain(
              event.exception?.values?.[0]?.value,
            );
            appErrors.push(event.exception?.values?.[0]?.value);
          },
        })
        .expect({
          event: event => {
            expect(event.message).toBe('pi-durable tools done');
          },
        })
        .start()
        .completed();

      expect(appErrors.sort()).toEqual(['Intentional pi-durable tool failure', 'app read failed']);
    });

    test('records the tool result the model receives', async () => {
      let errorSpanId: string | undefined;
      let failingToolSpanId: string | undefined;

      await createRunner()
        .unordered()
        .expect({
          event: event => {
            const exception = event.exception?.values?.[0];
            expect(exception?.value).toBe('Intentional pi-durable tool failure');
            expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
            errorSpanId = event.contexts?.trace?.span_id;
          },
        })
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('app read failed');
          },
        })
        .expect({
          span: container => {
            const spans = container.items;

            const bash = spans.find(span => span.name === 'execute_tool bash')!;
            expect(bash.status).toBe('error');
            expect(bash.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toMatch(/Command exited with code \d+/);

            const read = spans.find(span => span.name === 'execute_tool read')!;
            expect(read.status).toBe('error');
            expect(read.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toContain('app read failed');

            // The streamed output becomes the result, since the tool returns no content.
            const streamer = spans.find(span => span.name === 'execute_tool streamer')!;
            expect(streamer.status).toBe('ok');
            expect(streamer.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('line 1\nline 2\n');

            const secret = spans.find(span => span.name === 'execute_tool secret')!;
            expect(secret.attributes[GEN_AI_TOOL_CALL_RESULT]?.value).toBe('redacted by afterTool');

            const failNow = spans.find(span => span.name === 'execute_tool fail_now')!;
            expect(failNow.status).toBe('error');
            failingToolSpanId = failNow.span_id;
          },
        })
        .start()
        .completed();

      expect(errorSpanId).toBe(failingToolSpanId);
    });
  });
});
