import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  setCurrentClient,
  startSpan,
} from '../../../../src';
import { wrapTransportOnMessage, wrapTransportSend } from '../../../../src/integrations/mcp-server/transport';
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

function initClient(options: Parameters<typeof getDefaultTestClientOptions>[0]): void {
  const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ...options }));
  setCurrentClient(client);
  client.init();
}

describe('MCP server trace propagation via params._meta', () => {
  beforeEach(() => {
    initClient({ propagateTraceparent: true });
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

  it('ignores traceparent unless propagateTraceparent is enabled', () => {
    initClient({});
    let httpServerSpan: Span | undefined;
    const span = startSpan({ name: 'POST /mcp', op: 'http.server' }, ambient => {
      httpServerSpan = ambient;
      return deliver(createMockTransport(), toolCall({ traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` }));
    });

    const json = spanToJSON(span!);
    expect(json.trace_id).toBe(httpServerSpan!.spanContext().traceId);
    expect(json.parent_span_id).toBe(httpServerSpan!.spanContext().spanId);
  });

  it('continues from sentry-trace without propagateTraceparent', () => {
    initClient({});
    const span = deliver(createMockStdioTransport(), toolCall({ 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` }));

    const json = spanToJSON(span!);
    expect(json.trace_id).toBe(TRACE_ID);
    expect(json.parent_span_id).toBe(PARENT_SPAN_ID);
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

describe('MCP server trace injection into outgoing params._meta', () => {
  beforeEach(() => {
    initClient({ dsn: 'https://public@dsn.ingest.sentry.io/1337', propagateTraceparent: true });
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  function wrappedSend() {
    const transport = createMockStdioTransport();
    const originalSend = vi.fn().mockResolvedValue(undefined);
    transport.send = originalSend;
    wrapTransportSend(transport, {});
    return { send: transport.send, originalSend };
  }

  it('injects the active span into outgoing requests', async () => {
    const { send, originalSend } = wrappedSend();
    const request = { jsonrpc: '2.0', method: 'sampling/createMessage', id: 7, params: { maxTokens: 10 } };

    let toolSpan: Span | undefined;
    await startSpan({ name: 'tools/call get-weather' }, async span => {
      toolSpan = span;
      await send(request, { relatedRequestId: 1 });
    });

    const { traceId, spanId } = toolSpan!.spanContext();
    expect(originalSend).toHaveBeenCalledWith(
      {
        ...request,
        params: {
          maxTokens: 10,
          _meta: {
            'sentry-trace': `${traceId}-${spanId}-1`,
            traceparent: `00-${traceId}-${spanId}-01`,
            baggage: expect.stringContaining(`sentry-trace_id=${traceId}`),
          },
        },
      },
      { relatedRequestId: 1 },
    );
    expect(request.params).toEqual({ maxTokens: 10 });
  });

  it('parents outgoing notifications to their own notification span', async () => {
    const { send, originalSend } = wrappedSend();
    let notificationSpan: Span | undefined;
    getClient()!.on('spanStart', span => {
      if (spanToJSON(span).name === 'notifications/progress') {
        notificationSpan = span;
      }
    });

    await startSpan({ name: 'tools/call get-weather' }, () =>
      send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 1, progress: 50 } }),
    );

    const { traceId, spanId } = notificationSpan!.spanContext();
    expect(originalSend).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: 1,
        progress: 50,
        _meta: expect.objectContaining({
          'sentry-trace': `${traceId}-${spanId}-1`,
          traceparent: `00-${traceId}-${spanId}-01`,
        }),
      },
    });
  });

  it('only injects traceparent when propagateTraceparent is enabled', async () => {
    initClient({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    const { send, originalSend } = wrappedSend();

    await startSpan({ name: 'tools/call get-weather' }, () => send({ jsonrpc: '2.0', method: 'ping', id: 1 }));

    expect(originalSend).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
      params: { _meta: { 'sentry-trace': expect.any(String), baggage: expect.any(String) } },
    });
  });

  it('keeps existing _meta entries and adds params when there are none', async () => {
    const { send, originalSend } = wrappedSend();

    await startSpan({ name: 'tools/call get-weather' }, async () => {
      await send({ jsonrpc: '2.0', method: 'ping', id: 1 });
      await send({ jsonrpc: '2.0', method: 'roots/list', id: 2, params: { _meta: { 'com.example/key': 'value' } } });
    });

    expect(originalSend).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
      params: { _meta: expect.objectContaining({ 'sentry-trace': expect.any(String) }) },
    });
    expect(originalSend).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'roots/list',
      id: 2,
      params: { _meta: expect.objectContaining({ 'com.example/key': 'value', 'sentry-trace': expect.any(String) }) },
    });
  });

  it('merges existing third-party baggage entries with the Sentry entries', async () => {
    const { send, originalSend } = wrappedSend();

    await startSpan({ name: 'tools/call get-weather' }, () =>
      send({
        jsonrpc: '2.0',
        method: 'ping',
        id: 1,
        params: { _meta: { baggage: 'vendor=abc,sentry-release=stale' } },
      }),
    );

    expect(originalSend).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
      params: {
        _meta: expect.objectContaining({
          // The stale Sentry entry is replaced, third-party entries are kept.
          baggage: expect.stringMatching(/^vendor=abc,(?!.*stale).*sentry-trace_id=/),
        }),
      },
    });
  });

  it.each([
    ['a traceparent', { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` }],
    ['a sentry-trace', { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` }],
    ['a non-object _meta', 'not-an-object'],
  ])('leaves requests that already carry %s unchanged', async (_, meta) => {
    const { send, originalSend } = wrappedSend();
    const request = { jsonrpc: '2.0', method: 'elicitation/create', id: 3, params: { _meta: meta } };

    await startSpan({ name: 'tools/call get-weather' }, () => send(request));

    expect(originalSend).toHaveBeenCalledWith(request);
  });

  it('does not touch responses', async () => {
    const { send, originalSend } = wrappedSend();
    const response = { jsonrpc: '2.0', id: 1, result: { content: [] } };

    await startSpan({ name: 'tools/call get-weather' }, () => send(response));

    expect(originalSend).toHaveBeenCalledWith(response);
  });
});
