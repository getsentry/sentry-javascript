import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentClient } from '../../../../src';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { withActiveSpan } from '../../../../src/tracing';
import { startInactiveSpan, startSpan } from '../../../../src/tracing/trace';
import type { Span, StreamedSpanJSON } from '../../../../src/types/span';
import { getActiveSpan, spanToJSON } from '../../../../src/utils/spanUtils';
import { GLOBAL_OBJ } from '../../../../src/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';
import { resetGlobals } from '../../../testutils';

const OTEL_API_GLOBAL_KEY = Symbol.for('opentelemetry.js.api.1');

type Outcome = { type: 'result'; result: unknown } | { type: 'error'; error: { code: number; message: string } };

interface Scope {
  run<T>(fn: () => T): T;
  end(outcome: Outcome): void;
}

interface Operation {
  method: string;
  id?: string | number;
}

interface Instrumentation {
  send?: (operation: Operation) => Scope | undefined;
  receive?: (operation: Operation) => Scope | undefined;
}

// Mirrors the MCP SDK instrumentation under the Sentry tracer provider: one span per operation,
// ended before the response is sent.
function sentryTracedInstrumentation(): Instrumentation {
  const start = (operation: Operation, kind: 'client' | 'server'): Scope => {
    const span = startInactiveSpan({
      name: operation.method,
      attributes: { 'mcp.method.name': operation.method, 'sentry.kind': kind },
    });
    return { run: fn => withActiveSpan(span, fn), end: () => span.end() };
  };
  return { send: operation => start(operation, 'client'), receive: operation => start(operation, 'server') };
}

function foreignTracedInstrumentation(): Instrumentation {
  const scope: Scope = { run: fn => fn(), end: () => undefined };
  return { send: () => scope, receive: () => scope };
}

class InMemoryTransport {
  public onmessage?: (message: unknown, extra?: unknown) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sent: unknown[] = [];

  public async start(): Promise<void> {}

  public async send(message: unknown): Promise<void> {
    this.sent.push(message);
  }
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

// Follows the dispatch order of the MCP SDK's `Protocol`: the scope starts synchronously in
// `transport.onmessage`, the handler runs inside it, and the scope ends before the response is sent.
function createServer(instrumentation: Instrumentation | undefined) {
  const tools: Record<string, ToolHandler> = {};
  const protocol: { _instrumentation?: Instrumentation; transport?: InMemoryTransport } = {
    _instrumentation: instrumentation,
  };

  const mcpServer = {
    server: protocol,
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      tools[name] = handler;
    },
    registerResource() {},
    registerPrompt() {},
    async connect(transport: InMemoryTransport) {
      protocol.transport = transport;
      transport.onmessage = (message: unknown) => {
        const { id, method, params } = message as {
          id?: number;
          method: string;
          params?: { name?: string; arguments?: Record<string, unknown> };
        };
        const scope = protocol._instrumentation?.receive?.({ method, ...(id !== undefined && { id }) });
        const run = <T>(fn: () => T): T => (scope ? scope.run(fn) : fn());

        if (id === undefined) {
          scope?.end({ type: 'result', result: undefined });
          return;
        }

        const handler = (): Promise<unknown> =>
          method === 'tools/call'
            ? tools[params!.name!]!(params!.arguments ?? {})
            : Promise.resolve({ serverInfo: { name: 'test-server', version: '1.0.0' }, protocolVersion: '2025-06-18' });

        // Unlike the real `Protocol`, the handler starts synchronously: these tests run without an
        // async context strategy, so the active span does not carry across a microtask.
        void run(handler).then(async result => {
          scope?.end({ type: 'result', result });
          await transport.send({ jsonrpc: '2.0', id, result });
        });
      };
      await transport.start();
    },
    async notify(method: string) {
      const scope = protocol._instrumentation?.send?.({ method });
      const send = () => protocol.transport!.send({ jsonrpc: '2.0', method, params: {} });
      await (scope ? scope.run(send) : send());
      scope?.end({ type: 'result', result: undefined });
    },
  };

  return mcpServer;
}

async function callTool(transport: InMemoryTransport, name: string, args: Record<string, unknown>): Promise<void> {
  const responses = transport.sent.length;
  transport.onmessage?.({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, {});
  await vi.waitFor(() => expect(transport.sent.length).toBeGreaterThan(responses));
}

describe('MCP server hand-off to the MCP SDK instrumentation', () => {
  let client: TestClient;
  let endedSpans: StreamedSpanJSON[];
  let originalOtelRegistry: unknown;

  const mcpSpans = (): StreamedSpanJSON[] =>
    endedSpans.filter(span => span.attributes['mcp.method.name'] !== undefined);
  const registerTracerProvider = (): void => {
    (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[OTEL_API_GLOBAL_KEY] = { version: '1.9.0', trace: {} };
  };

  beforeEach(() => {
    resetGlobals();
    originalOtelRegistry = (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[OTEL_API_GLOBAL_KEY];
    client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => {
      endedSpans.push(spanToJSON(span));
    });
  });

  afterEach(() => {
    (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[OTEL_API_GLOBAL_KEY] = originalOtelRegistry;
  });

  it('enriches the span the MCP SDK starts instead of starting a second one', async () => {
    registerTracerProvider();
    const server = wrapMcpServerWithSentry(createServer(sentryTracedInstrumentation()));
    let handlerParent: Span | undefined;
    server.registerTool('echo', {}, async ({ message }) => {
      handlerParent = getActiveSpan();
      startSpan({ name: 'inside-tool' }, () => undefined);
      return { content: [{ type: 'text', text: `echo: ${message as string}` }] };
    });

    const transport = new InMemoryTransport();
    await server.connect(transport);
    await callTool(transport, 'echo', { message: 'hi' });

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    const [toolSpan] = spans;
    expect(toolSpan!.attributes).toMatchObject({
      'sentry.kind': 'server',
      'sentry.op': 'mcp.server',
      'sentry.origin': 'auto.function.mcp_server',
      'mcp.tool.name': 'echo',
      'mcp.request.argument.message': '"hi"',
      'mcp.tool.result.content_count': 1,
    });
    expect(spanToJSON(handlerParent!).span_id).toBe(toolSpan!.span_id);
    expect(endedSpans.find(span => span.name === 'inside-tool')!.parent_span_id).toBe(toolSpan!.span_id);
  });

  it('records initialize session data on the MCP SDK span', async () => {
    registerTracerProvider();
    const server = wrapMcpServerWithSentry(createServer(sentryTracedInstrumentation()));
    const transport = new InMemoryTransport();
    await server.connect(transport);

    transport.onmessage?.(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test-client', version: '1.0.0' } },
      },
      {},
    );
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({
      'sentry.op': 'mcp.server',
      'mcp.client.name': 'test-client',
      'mcp.server.name': 'test-server',
      'mcp.protocol.version': '2025-06-18',
    });
  });

  it('enriches the MCP SDK span of an incoming notification', async () => {
    registerTracerProvider();
    const server = wrapMcpServerWithSentry(createServer(sentryTracedInstrumentation()));
    const transport = new InMemoryTransport();
    await server.connect(transport);

    transport.onmessage?.({ jsonrpc: '2.0', method: 'notifications/initialized' }, {});

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({
      'sentry.kind': 'server',
      'sentry.op': 'mcp.notification.client_to_server',
    });
  });

  it('enriches the MCP SDK span of an outgoing notification', async () => {
    registerTracerProvider();
    const server = wrapMcpServerWithSentry(createServer(sentryTracedInstrumentation()));
    const transport = new InMemoryTransport();
    await server.connect(transport);

    await server.notify('notifications/tools/list_changed');

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({
      'sentry.kind': 'client',
      'sentry.op': 'mcp.notification.server_to_client',
    });
  });

  it('starts its own span when the MCP SDK span does not reach Sentry', async () => {
    registerTracerProvider();
    const server = wrapMcpServerWithSentry(createServer(foreignTracedInstrumentation()));
    let handlerSpan: Span | undefined;
    server.registerTool('echo', {}, async () => {
      handlerSpan = getActiveSpan();
      return { content: [{ type: 'text', text: 'echo' }] };
    });

    const transport = new InMemoryTransport();
    await server.connect(transport);
    await callTool(transport, 'echo', {});

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({ 'sentry.op': 'mcp.server', 'mcp.tool.result.content_count': 1 });
    expect(spans[0]!.attributes['sentry.kind']).toBeUndefined();
    expect(spanToJSON(handlerSpan!).span_id).toBe(spans[0]!.span_id);
  });

  it.each([
    ['no tracer provider is registered', false, foreignTracedInstrumentation()],
    ['the MCP SDK has no instrumentation', true, undefined],
  ])('keeps starting its own spans when %s', async (_, withTracerProvider, instrumentation) => {
    if (withTracerProvider) {
      registerTracerProvider();
    }
    const server = wrapMcpServerWithSentry(createServer(instrumentation));
    server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'echo' }] }));

    const transport = new InMemoryTransport();
    await server.connect(transport);
    await callTool(transport, 'echo', {});

    const spans = mcpSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({ 'sentry.op': 'mcp.server', 'mcp.tool.result.content_count': 1 });
  });
});
