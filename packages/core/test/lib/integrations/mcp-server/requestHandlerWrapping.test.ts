import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureError } from '../../../../src/integrations/mcp-server/errorCapture';
import { wrapAllMCPHandlers, wrapToolHandlers } from '../../../../src/integrations/mcp-server/handlers';
import type { MCPServerInstance } from '../../../../src/integrations/mcp-server/types';

vi.mock('../../../../src/integrations/mcp-server/errorCapture', () => ({
  captureError: vi.fn(),
}));

type TestHandler = (...args: unknown[]) => unknown;

describe('low-level MCP request handler wrapping', () => {
  const captureErrorMock = vi.mocked(captureError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the SDK v1 schema-based setRequestHandler form', async () => {
    let registeredHandler: TestHandler | undefined;
    const setRequestHandler = vi.fn((_schema: unknown, handler: TestHandler) => {
      registeredHandler = handler;
    });
    const server = { connect: vi.fn(), setRequestHandler };
    const requestSchema = { shape: { method: { value: 'legacy/search' } } };
    const handlerError = new Error('legacy request failed');
    const handler = vi.fn().mockRejectedValue(handlerError);

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);
    server.setRequestHandler(requestSchema, handler);

    await expect(
      registeredHandler?.({ method: 'legacy/search' }, { signal: new AbortController().signal }),
    ).rejects.toBe(handlerError);
    expect(setRequestHandler).toHaveBeenCalledWith(requestSchema, expect.any(Function));
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'protocol', { method_name: 'legacy/search' });
  });

  it('wraps a low-level handler registered before Sentry', async () => {
    const handlerError = new Error('preexisting request failed');
    const handler = vi.fn().mockRejectedValue(handlerError);
    const requestHandlers = new Map<string, TestHandler>([['acme/preexisting', handler]]);
    const server = {
      _requestHandlers: requestHandlers,
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
    };

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);

    const registeredHandler = requestHandlers.get('acme/preexisting');
    await expect(registeredHandler?.({}, { mcpReq: { signal: new AbortController().signal } })).rejects.toBe(
      handlerError,
    );
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'protocol', {
      method_name: 'acme/preexisting',
    });
  });

  it('does not capture caller protocol errors from a preexisting composed handler', async () => {
    const protocolError = Object.assign(new Error('Invalid params'), { code: -32602 });
    const handler = vi.fn().mockRejectedValue(protocolError);
    const requestHandlers = new Map<string, TestHandler>([['prompts/get', handler]]);
    const server = {
      _requestHandlers: requestHandlers,
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
    };

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);

    await expect(requestHandlers.get('prompts/get')?.()).rejects.toBe(protocolError);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('does not capture modern capability errors from a preexisting composed handler', async () => {
    const protocolError = Object.assign(new Error('Missing required client capability'), { code: -32021 });
    const handler = vi.fn().mockRejectedValue(protocolError);
    const requestHandlers = new Map<string, TestHandler>([['tools/call', handler]]);
    const server = {
      _requestHandlers: requestHandlers,
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
    };

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);

    await expect(
      requestHandlers.get('tools/call')?.({
        params: {
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
        },
      }),
    ).rejects.toBe(protocolError);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('does not capture legacy URL elicitation control flow', async () => {
    const protocolError = Object.assign(new Error('URL elicitation required'), { code: -32042 });
    const handler = vi.fn().mockRejectedValue(protocolError);
    const requestHandlers = new Map<string, TestHandler>([['tools/call', handler]]);
    const server = {
      _requestHandlers: requestHandlers,
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
    };

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);

    await expect(requestHandlers.get('tools/call')?.({ params: {} })).rejects.toBe(protocolError);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('still captures an implementation-defined legacy error that overlaps a modern caller code', async () => {
    const protocolError = Object.assign(new Error('Legacy implementation failed'), { code: -32021 });
    const handler = vi.fn().mockRejectedValue(protocolError);
    const requestHandlers = new Map<string, TestHandler>([['tools/call', handler]]);
    const server = {
      _requestHandlers: requestHandlers,
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
    };

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);

    await expect(requestHandlers.get('tools/call')?.({ params: {} })).rejects.toBe(protocolError);
    expect(captureErrorMock).toHaveBeenCalledWith(protocolError, 'protocol', { method_name: 'tools/call' });
  });

  it.each([
    { context: (signal: AbortSignal) => ({ mcpReq: { signal } }), sdkVersion: 'v2' },
    { context: (signal: AbortSignal) => ({ signal }), sdkVersion: 'v1' },
  ])('does not capture a genuine $sdkVersion cancellation', async ({ context }) => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const cancellationError = new DOMException('The request was aborted', 'AbortError');
    const abortController = new AbortController();
    abortController.abort(cancellationError);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('cancelled-tool', {}, vi.fn().mockRejectedValue(cancellationError));

    await expect(registeredHandler?.({}, context(abortController.signal))).rejects.toBe(cancellationError);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('captures a business error even when its request was also aborted', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const cancellationReason = new DOMException('The request was aborted', 'AbortError');
    const businessError = new Error('database write failed');
    const abortController = new AbortController();
    abortController.abort(cancellationReason);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('database-tool', {}, vi.fn().mockRejectedValue(businessError));

    await expect(registeredHandler?.({}, { mcpReq: { signal: abortController.signal } })).rejects.toBe(businessError);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(businessError, 'tool_execution', { tool_name: 'database-tool' });
  });

  it('normalizes an object rejection without invoking its toString method', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const toString = vi.fn(() => 'secret-token');
    const rejectedValue = { toString };

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('safe-normalization-tool', {}, vi.fn().mockRejectedValue(rejectedValue));

    await expect(registeredHandler?.()).rejects.toBe(rejectedValue);
    expect(toString).not.toHaveBeenCalled();
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      new Error('Non-Error exception thrown by MCP handler'),
      'tool_execution',
      { tool_name: 'safe-normalization-tool' },
    );
  });

  it('captures a revoked Proxy rejection without inspecting it', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const revocable = Proxy.revocable({}, {});
    const rejectedValue = revocable.proxy;
    revocable.revoke();

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('proxy-safe-tool', {}, vi.fn().mockRejectedValue(rejectedValue));

    await expect(registeredHandler?.()).rejects.toBe(rejectedValue);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      new Error('Non-Error exception thrown by MCP handler'),
      'tool_execution',
      { tool_name: 'proxy-safe-tool' },
    );
  });

  it('bounds handler names stored in issue mechanism data', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handlerError = new Error('long-name tool failed');
    const longName = 'x'.repeat(300);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool(longName, {}, vi.fn().mockRejectedValue(handlerError));

    await expect(registeredHandler?.()).rejects.toBe(handlerError);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'tool_execution', {
      tool_name: `${'x'.repeat(253)}...`,
    });
  });
});
