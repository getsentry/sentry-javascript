import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, getDynamicSamplingContextFromSpan, setCurrentClient, startSpan } from '../../../../src';
import { wrapTransportOnMessage } from '../../../../src/integrations/mcp-server/transport';
import type { Span } from '../../../../src/types/span';
import { getActiveSpan, spanToJSON } from '../../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';
import { createMockStdioTransport, createMockTransport } from './testUtils';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT_SPAN_ID = '00f067aa0ba902b7';

function deliver(transport: { onmessage?: (...args: unknown[]) => unknown }, message: unknown): Span | undefined {
  let activeSpan: Span | undefined;
  transport.onmessage = () => {
    activeSpan = getActiveSpan();
  };
  wrapTransportOnMessage(transport as Parameters<typeof wrapTransportOnMessage>[0], {});
  transport.onmessage(message);
  return activeSpan;
}

function toolCall(meta?: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: { name: 'get-weather', ...(meta && { _meta: meta }) },
  };
}

describe('MCP server trace propagation via params._meta', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('continues the trace from a W3C traceparent', () => {
    const span = deliver(createMockStdioTransport(), toolCall({ traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` }));

    const json = spanToJSON(span!);
    expect(json.name).toBe('tools/call get-weather');
    expect(json.trace_id).toBe(TRACE_ID);
    expect(json.parent_span_id).toBe(PARENT_SPAN_ID);
    expect(json.links).toBeUndefined();
  });

  it('prefers sentry-trace and applies the incoming baggage', () => {
    const span = deliver(
      createMockStdioTransport(),
      toolCall({
        'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
        traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
        baggage: 'sentry-trace_id=4bf92f3577b34da6a3ce929d0e0e4736,sentry-release=upstream-release',
      }),
    );

    const json = spanToJSON(span!);
    expect(json.trace_id).toBe(TRACE_ID);
    expect(json.parent_span_id).toBe(PARENT_SPAN_ID);
    expect(getDynamicSamplingContextFromSpan(span!).release).toBe('upstream-release');
  });

  it('parents to the _meta context and links the ambient transport span', () => {
    let httpServerSpan: Span | undefined;
    const span = startSpan({ name: 'POST /mcp', op: 'http.server' }, ambient => {
      httpServerSpan = ambient;
      return deliver(createMockTransport(), toolCall({ traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` }));
    });

    const json = spanToJSON(span!);
    const ambientContext = httpServerSpan!.spanContext();
    expect(json.trace_id).toBe(TRACE_ID);
    expect(json.parent_span_id).toBe(PARENT_SPAN_ID);
    expect(json.links).toEqual([
      expect.objectContaining({ trace_id: ambientContext.traceId, span_id: ambientContext.spanId }),
    ]);
  });

  it('continues the trace for incoming notifications', () => {
    const span = deliver(createMockStdioTransport(), {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 1, _meta: { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` } },
    });

    const json = spanToJSON(span!);
    expect(json.trace_id).toBe(TRACE_ID);
    expect(json.parent_span_id).toBe(PARENT_SPAN_ID);
  });

  it.each([
    ['no _meta', undefined],
    ['an unsupported traceparent version', { traceparent: `01-${TRACE_ID}-${PARENT_SPAN_ID}-01` }],
    ['a malformed traceparent', { traceparent: '00-not-a-trace-01' }],
    ['a malformed sentry-trace', { 'sentry-trace': 'garbage' }],
    ['a non-string traceparent', { traceparent: 42 }],
  ])('keeps the transport trace for %s', (_, meta) => {
    let httpServerSpan: Span | undefined;
    const span = startSpan({ name: 'POST /mcp', op: 'http.server' }, ambient => {
      httpServerSpan = ambient;
      return deliver(createMockTransport(), toolCall(meta));
    });

    const json = spanToJSON(span!);
    expect(json.trace_id).toBe(httpServerSpan!.spanContext().traceId);
    expect(json.parent_span_id).toBe(httpServerSpan!.spanContext().spanId);
    expect(json.links).toBeUndefined();
  });
});
