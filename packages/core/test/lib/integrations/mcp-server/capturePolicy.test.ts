import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, withScope } from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { Scope } from '../../../../src/scope';
import * as tracingModule from '../../../../src/tracing';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP Server Capture Policy', () => {
  type MockTransport = ReturnType<typeof createMockTransport>;
  type MockServer = ReturnType<typeof createMockMcpServer>;
  type MockSpan = ReturnType<typeof createMockSpan>;
  type WrapperOptions = Parameters<typeof wrapMcpServerWithSentry>[1];

  const startSpanSpy = vi.spyOn(tracingModule, 'startSpan');
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const connectedTransports: MockTransport[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    for (const transport of connectedTransports) {
      transport.onclose?.();
    }
    connectedTransports.length = 0;
    getCurrentScope().setClient(undefined);
  });

  function createClientScope(inputs: boolean, outputs: boolean): Scope {
    const scope = new Scope();
    scope.setClient(createMockClient(true, { inputs, outputs }));
    return scope;
  }

  function createMockSpan() {
    return {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
  }

  function queueInactiveSpan(): MockSpan {
    const span = createMockSpan();
    startInactiveSpanSpy.mockReturnValueOnce(span as unknown as ReturnType<typeof tracingModule.startInactiveSpan>);
    return span;
  }

  async function connectServer(server: MockServer, sessionId: string): Promise<MockTransport> {
    const transport = createMockTransport();
    transport.sessionId = sessionId;
    connectedTransports.push(transport);
    await server.connect(transport);
    return transport;
  }

  function connectWrappedServer(sessionId: string, options?: WrapperOptions): Promise<MockTransport> {
    return connectServer(wrapMcpServerWithSentry(createMockMcpServer(), options), sessionId);
  }

  function receiveToolCall(
    transport: MockTransport,
    scope: Scope,
    request: { id: string; name?: string; location?: string },
  ): void {
    const { id, name = 'weather', location } = request;
    const params = {
      name,
      ...(location !== undefined && { arguments: { location } }),
    };

    withScope(scope, () => {
      transport.onmessage?.({ jsonrpc: '2.0', method: 'tools/call', id, params }, {});
    });
  }

  async function sendToolResult(
    transport: MockTransport,
    scope: Scope,
    response: { id: string; text: string },
  ): Promise<void> {
    await withScope(scope, () =>
      transport.send?.({
        jsonrpc: '2.0',
        id: response.id,
        result: {
          content: [{ type: 'text', text: response.text }],
          isError: false,
        },
      }),
    );
  }

  function buildToolSpanConfig(request: { id: string; sessionId: string; name?: string; location?: string }) {
    const { id, sessionId, name = 'weather', location } = request;
    return {
      name: `tools/call ${name}`,
      op: 'mcp.server',
      forceTransaction: true,
      attributes: {
        'mcp.method.name': 'tools/call',
        'mcp.tool.name': name,
        'mcp.request.id': id,
        'mcp.session.id': sessionId,
        'mcp.transport': 'StreamableHTTPServerTransport',
        'network.transport': 'tcp',
        'network.protocol.version': '2.0',
        ...(location !== undefined && { 'mcp.request.argument.location': JSON.stringify(location) }),
        'sentry.op': 'mcp.server',
        'sentry.origin': 'auto.function.mcp_server',
        'sentry.source': 'route',
      },
    };
  }

  function expectToolResult(span: MockSpan, content?: string): void {
    expect(span.setAttributes).toHaveBeenCalledOnce();
    expect(span.setAttributes).toHaveBeenCalledWith({
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.content_type': 'text',
      ...(content !== undefined && { 'mcp.tool.result.content': content }),
      'mcp.tool.result.is_error': false,
    });
  }

  function buildLoggingSpanConfig(options: {
    direction: 'client_to_server' | 'server_to_client';
    level: string;
    sessionId: string;
  }) {
    return {
      name: 'notifications/message',
      forceTransaction: true,
      attributes: {
        'mcp.method.name': 'notifications/message',
        'mcp.session.id': options.sessionId,
        'mcp.transport': 'StreamableHTTPServerTransport',
        'network.transport': 'tcp',
        'network.protocol.version': '2.0',
        'mcp.logging.level': options.level,
        'mcp.logging.logger': 'weather-service',
        'mcp.logging.data_type': 'string',
        'sentry.op': `mcp.notification.${options.direction}`,
        'sentry.origin': 'auto.mcp.notification',
        'sentry.source': 'route',
      },
    };
  }

  it('resolves input capture when an operation starts after wrapping without a client', async () => {
    const transport = await connectWrappedServer('capture-policy-input');
    queueInactiveSpan();

    receiveToolCall(transport, createClientScope(false, false), {
      id: 'private-input-request',
      location: 'Madrid, Spain',
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledOnce();
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      buildToolSpanConfig({ id: 'private-input-request', sessionId: 'capture-policy-input' }),
    );
  });

  it('resolves output capture when an operation starts after wrapping without a client', async () => {
    const transport = await connectWrappedServer('capture-policy-output');
    const privacyScope = createClientScope(false, false);
    const span = queueInactiveSpan();

    receiveToolCall(transport, privacyScope, { id: 'private-output-request' });
    await sendToolResult(transport, privacyScope, {
      id: 'private-output-request',
      text: 'Private forecast for Madrid',
    });

    expectToolResult(span);
  });

  it('isolates capture policy between operations running in different scopes', async () => {
    const transport = await connectWrappedServer('capture-policy-scopes');
    queueInactiveSpan();
    queueInactiveSpan();

    receiveToolCall(transport, createClientScope(false, false), {
      id: 'private-scope-request',
      location: 'Madrid, Spain',
    });
    receiveToolCall(transport, createClientScope(true, true), {
      id: 'recording-scope-request',
      location: 'Berlin, Germany',
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(2);
    expect(startInactiveSpanSpy).toHaveBeenNthCalledWith(
      1,
      buildToolSpanConfig({ id: 'private-scope-request', sessionId: 'capture-policy-scopes' }),
    );
    expect(startInactiveSpanSpy).toHaveBeenNthCalledWith(
      2,
      buildToolSpanConfig({
        id: 'recording-scope-request',
        sessionId: 'capture-policy-scopes',
        location: 'Berlin, Germany',
      }),
    );
  });

  it('uses the request policy snapshot when the response runs with a different client', async () => {
    const transport = await connectWrappedServer('capture-policy-snapshot');
    const span = queueInactiveSpan();

    receiveToolCall(transport, createClientScope(true, false), { id: 'snapshot-request' });
    await sendToolResult(transport, createClientScope(false, true), {
      id: 'snapshot-request',
      text: 'Private forecast for Valencia',
    });

    expectToolResult(span);
  });

  it('keeps explicit overrides while resolving unspecified policy per operation', async () => {
    const transport = await connectWrappedServer('capture-policy-explicit-options', { recordInputs: true });
    const operationScope = createClientScope(false, false);
    const span = queueInactiveSpan();

    receiveToolCall(transport, operationScope, {
      id: 'explicit-options-request',
      location: 'Lisbon, Portugal',
    });
    await sendToolResult(transport, operationScope, {
      id: 'explicit-options-request',
      text: 'Private forecast for Lisbon',
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledOnce();
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      buildToolSpanConfig({
        id: 'explicit-options-request',
        sessionId: 'capture-policy-explicit-options',
        location: 'Lisbon, Portugal',
      }),
    );
    expectToolResult(span);
  });

  it('resolves input capture for incoming notifications after wrapping without a client', async () => {
    const transport = await connectWrappedServer('capture-policy-incoming-notification');
    const privacyScope = createClientScope(false, false);

    withScope(privacyScope, () => {
      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'notifications/message',
          params: { level: 'info', logger: 'weather-service', data: 'Private incoming notification' },
        },
        {},
      );
    });

    expect(startSpanSpy).toHaveBeenCalledOnce();
    expect(startSpanSpy).toHaveBeenCalledWith(
      buildLoggingSpanConfig({
        direction: 'client_to_server',
        level: 'info',
        sessionId: 'capture-policy-incoming-notification',
      }),
      expect.any(Function),
    );
  });

  it('resolves input capture for outgoing notifications after wrapping without a client', async () => {
    const transport = await connectWrappedServer('capture-policy-outgoing-notification');
    const privacyScope = createClientScope(false, false);

    await withScope(privacyScope, () =>
      transport.send?.({
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: { level: 'warning', logger: 'weather-service', data: 'Private outgoing notification' },
      }),
    );

    expect(startSpanSpy).toHaveBeenCalledOnce();
    expect(startSpanSpy).toHaveBeenCalledWith(
      buildLoggingSpanConfig({
        direction: 'server_to_client',
        level: 'warning',
        sessionId: 'capture-policy-outgoing-notification',
      }),
      expect.any(Function),
    );
  });

  it('keeps output policies isolated for concurrent requests completed in reverse order', async () => {
    const transport = await connectWrappedServer('capture-policy-concurrent-requests');
    const privacyScope = createClientScope(false, false);
    const recordingScope = createClientScope(false, true);
    const privateSpan = queueInactiveSpan();
    const recordingSpan = queueInactiveSpan();

    receiveToolCall(transport, privacyScope, { id: 'private-concurrent-request', name: 'private-weather' });
    receiveToolCall(transport, recordingScope, { id: 'recording-concurrent-request', name: 'recording-weather' });
    await sendToolResult(transport, privacyScope, {
      id: 'recording-concurrent-request',
      text: 'Recorded forecast for Oslo',
    });
    await sendToolResult(transport, recordingScope, {
      id: 'private-concurrent-request',
      text: 'Private forecast for Stockholm',
    });

    expectToolResult(recordingSpan, 'Recorded forecast for Oslo');
    expectToolResult(privateSpan);
  });

  it('combines an explicit output override with the operation input policy', async () => {
    const transport = await connectWrappedServer('capture-policy-partial-output-override', { recordOutputs: true });
    const privacyScope = createClientScope(false, false);
    const span = queueInactiveSpan();

    receiveToolCall(transport, privacyScope, {
      id: 'partial-output-override-request',
      location: 'Tallinn, Estonia',
    });
    await sendToolResult(transport, privacyScope, {
      id: 'partial-output-override-request',
      text: 'Recorded forecast for Tallinn',
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledOnce();
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      buildToolSpanConfig({
        id: 'partial-output-override-request',
        sessionId: 'capture-policy-partial-output-override',
      }),
    );
    expectToolResult(span, 'Recorded forecast for Tallinn');
  });

  it('snapshots explicit overrides from the first wrap', async () => {
    const options = { recordInputs: false, recordOutputs: false };
    const server = wrapMcpServerWithSentry(createMockMcpServer(), options);
    options.recordInputs = true;
    options.recordOutputs = true;
    wrapMcpServerWithSentry(server, { recordInputs: true, recordOutputs: true });
    const transport = await connectServer(server, 'capture-policy-first-wrap');
    const recordingScope = createClientScope(true, true);
    const span = queueInactiveSpan();

    receiveToolCall(transport, recordingScope, {
      id: 'first-wrap-request',
      location: 'Reykjavik, Iceland',
    });
    await sendToolResult(transport, recordingScope, {
      id: 'first-wrap-request',
      text: 'Private forecast for Reykjavik',
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledOnce();
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      buildToolSpanConfig({ id: 'first-wrap-request', sessionId: 'capture-policy-first-wrap' }),
    );
    expectToolResult(span);
  });
});
