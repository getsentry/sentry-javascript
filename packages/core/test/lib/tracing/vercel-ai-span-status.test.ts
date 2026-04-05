import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import type { SpanJSON } from '../../../src/types-hoist/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('vercel-ai span status normalization', () => {
  function processSpan(status: string): string | undefined {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    const client = new TestClient(options);
    client.init();
    addVercelAiProcessors(client);

    const span: SpanJSON = {
      description: 'test',
      span_id: 'test-span-id',
      trace_id: 'test-trace-id',
      start_timestamp: 1000,
      timestamp: 2000,
      origin: 'auto.vercelai.otel',
      status,
      data: {},
    };

    const eventProcessor = client['_eventProcessors'].find(p => p.id === 'VercelAiEventProcessor');
    const processedEvent = eventProcessor!({ type: 'transaction' as const, spans: [span] }, {});
    return (processedEvent as { spans?: SpanJSON[] })?.spans?.[0]?.status;
  }

  it('normalizes raw error message status to internal_error', () => {
    expect(processSpan("FileNotFoundError: The file '/nonexistent/file.txt' does not exist")).toBe('internal_error');
  });

  it('preserves ok status', () => {
    expect(processSpan('ok')).toBe('ok');
  });
});
