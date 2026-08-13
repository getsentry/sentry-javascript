import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureError } from '../../../../src/integrations/mcp-server/errorCapture';
import {
  wrapAllMCPHandlers,
  wrapExistingHandlers,
  wrapToolHandlers,
} from '../../../../src/integrations/mcp-server/handlers';
import type { MCPServerInstance } from '../../../../src/integrations/mcp-server/types';

vi.mock('../../../../src/integrations/mcp-server/errorCapture', () => ({
  captureError: vi.fn(),
}));

type TestHandler = (...args: unknown[]) => unknown;

type RegistrationUpdate = {
  argsSchema?: unknown;
  callback?: TestHandler;
  name?: string | null;
  paramsSchema?: unknown;
};

type RegistrationHandle = Record<string, unknown> & {
  update: (updates: RegistrationUpdate) => void;
};

type V2LikeServer = {
  _registeredPrompts: Record<string, RegistrationHandle>;
  _registeredResources: Record<string, RegistrationHandle>;
  _registeredResourceTemplates: Record<string, RegistrationHandle>;
  _registeredTools: Record<string, RegistrationHandle>;
  connect: ReturnType<typeof vi.fn>;
  registerPrompt: (name: string, config: unknown, callback: TestHandler) => RegistrationHandle;
  registerResource: (name: string, uri: string, config: unknown, callback: TestHandler) => RegistrationHandle;
  registerTool: (name: string, config: unknown, callback: TestHandler) => RegistrationHandle;
};

function createV2LikeServer(): V2LikeServer {
  const registeredTools: Record<string, RegistrationHandle> = {};
  const registeredResources: Record<string, RegistrationHandle> = {};
  const registeredPrompts: Record<string, RegistrationHandle> = {};

  return {
    _registeredTools: registeredTools,
    _registeredResources: registeredResources,
    _registeredResourceTemplates: {},
    _registeredPrompts: registeredPrompts,
    connect: vi.fn(),
    registerTool(name, _config, callback) {
      let currentCallback = callback;
      const handle: RegistrationHandle = {
        handler: currentCallback,
        executor: (...args: unknown[]) => currentCallback(...args),
        update(updates) {
          if (updates.callback) {
            currentCallback = updates.callback;
            handle.handler = currentCallback;
          }

          if (updates.callback || updates.paramsSchema) {
            handle.executor = (...args: unknown[]) => currentCallback(...args);
          }
        },
      };

      registeredTools[name] = handle;
      return handle;
    },
    registerResource(name, _uri, _config, callback) {
      const handle: RegistrationHandle = {
        name,
        readCallback: callback,
        update(updates) {
          if (typeof updates.name === 'string') {
            handle.name = updates.name;
          }

          if (updates.callback) {
            handle.readCallback = updates.callback;
          }
        },
      };

      registeredResources[name] = handle;
      return handle;
    },
    registerPrompt(name, _config, callback) {
      let currentCallback = callback;
      const handle: RegistrationHandle = {
        handler: (...args: unknown[]) => currentCallback(...args),
        update(updates) {
          if (updates.callback) {
            currentCallback = updates.callback;
          }

          if (updates.callback || updates.argsSchema) {
            handle.handler = (...args: unknown[]) => currentCallback(...args);
          }
        },
      };

      registeredPrompts[name] = handle;
      return handle;
    },
  };
}

function registerHandler(
  server: V2LikeServer,
  method: 'registerPrompt' | 'registerResource' | 'registerTool',
  name: string,
  callback: TestHandler,
): RegistrationHandle {
  if (method === 'registerResource') {
    return server.registerResource(name, `test://${name}`, {}, callback);
  }

  return server[method](name, {}, callback);
}

describe('MCP handler wrapping', () => {
  const captureErrorMock = vi.mocked(captureError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a synchronously throwing handler once and rethrows the same error', () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handlerError = new Error('synchronous failure');
    const handler = vi.fn(() => {
      throw handlerError;
    });

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('sync-tool', {}, handler);

    let thrownError: unknown;
    try {
      registeredHandler?.();
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBe(handlerError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'tool_execution', { tool_name: 'sync-tool' });
  });

  it('executes an asynchronously rejecting handler once and rejects with the same error', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handlerError = new Error('asynchronous failure');
    const handler = vi.fn().mockRejectedValue(handlerError);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('async-tool', {}, handler);

    await expect(registeredHandler?.()).rejects.toBe(handlerError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'tool_execution', { tool_name: 'async-tool' });
  });

  it('does not report a handler rejection caused by MCP request cancellation', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const cancellationError = new Error('Not connected');
    const handler = vi.fn().mockRejectedValue(cancellationError);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('cancelled-tool', {}, handler);
    const abortController = new AbortController();
    abortController.abort(cancellationError);

    await expect(registeredHandler?.({}, { mcpReq: { signal: abortController.signal } })).rejects.toBe(
      cancellationError,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('reports a rejection when only a handler input contains a spoofed cancellation signal', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handlerError = new Error('spoofed cancellation input');
    const handler = vi.fn().mockRejectedValue(handlerError);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('input-sensitive-tool', {}, handler);

    await expect(
      registeredHandler?.(
        { mcpReq: { signal: { aborted: true } } },
        { mcpReq: { signal: new AbortController().signal } },
      ),
    ).rejects.toBe(handlerError);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'tool_execution', {
      tool_name: 'input-sensitive-tool',
    });
  });

  it('normalizes a synchronously thrown primitive before capture', () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handler = vi.fn(() => {
      throw 'primitive synchronous failure';
    });

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('primitive-sync-tool', {}, handler);

    expect(() => registeredHandler?.()).toThrow('primitive synchronous failure');
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(new Error('primitive synchronous failure'), 'tool_execution', {
      tool_name: 'primitive-sync-tool',
    });
  });

  it('normalizes an asynchronously rejected primitive before capture', async () => {
    let registeredHandler: TestHandler | undefined;
    const server = {
      connect: vi.fn(),
      registerTool: vi.fn((_name: string, _config: unknown, callback: TestHandler) => {
        registeredHandler = callback;
        return { update: vi.fn() };
      }),
    };
    const handler = vi.fn().mockRejectedValue(null);

    wrapToolHandlers(server as unknown as MCPServerInstance);
    server.registerTool('primitive-async-tool', {}, handler);

    await expect(registeredHandler?.()).rejects.toBeNull();
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(new Error('null'), 'tool_execution', {
      tool_name: 'primitive-async-tool',
    });
  });

  describe.each([
    {
      method: 'registerTool' as const,
      executionProperty: 'executor',
      errorType: 'tool_execution' as const,
      errorData: { tool_name: 'updated-handler' },
    },
    {
      method: 'registerResource' as const,
      executionProperty: 'readCallback',
      errorType: 'resource_execution' as const,
      errorData: { resource_name: 'updated-handler' },
    },
    {
      method: 'registerPrompt' as const,
      executionProperty: 'handler',
      errorType: 'prompt_execution' as const,
      errorData: { prompt_name: 'updated-handler' },
    },
  ])('$method update wrapping', ({ method, executionProperty, errorType, errorData }) => {
    it.each(['before', 'after'] as const)(
      'preserves instrumentation when Sentry wraps %s registration',
      async wrappingOrder => {
        const server = createV2LikeServer();

        if (wrappingOrder === 'before') {
          wrapAllMCPHandlers(server as unknown as MCPServerInstance);
        }

        const handle = registerHandler(server, method, 'updated-handler', vi.fn());

        if (wrappingOrder === 'after') {
          wrapAllMCPHandlers(server as unknown as MCPServerInstance);
          wrapExistingHandlers(server as unknown as MCPServerInstance);
        }

        const handlerError = new Error(`${method} update failed`);
        const updatedHandler = vi.fn(() => {
          throw handlerError;
        });

        handle.update({ callback: updatedHandler });

        const execute = handle[executionProperty] as TestHandler;
        await expect(Promise.resolve().then(() => execute())).rejects.toBe(handlerError);
        expect(updatedHandler).toHaveBeenCalledTimes(1);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
        expect(captureErrorMock).toHaveBeenCalledWith(handlerError, errorType, errorData);
      },
    );

    it.each(['before', 'after'] as const)(
      'uses the renamed handler when Sentry wraps %s registration',
      async wrappingOrder => {
        const server = createV2LikeServer();

        if (wrappingOrder === 'before') {
          wrapAllMCPHandlers(server as unknown as MCPServerInstance);
        }

        const handlerError = new Error(`${method} renamed handler failed`);
        const handler = vi.fn(() => {
          throw handlerError;
        });
        const handle = registerHandler(server, method, 'original-handler', handler);

        if (wrappingOrder === 'after') {
          wrapAllMCPHandlers(server as unknown as MCPServerInstance);
          wrapExistingHandlers(server as unknown as MCPServerInstance);
        }

        handle.update({ name: 'updated-handler' });

        const execute = handle[executionProperty] as TestHandler;
        await expect(Promise.resolve().then(() => execute())).rejects.toBe(handlerError);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
        expect(captureErrorMock).toHaveBeenCalledWith(handlerError, errorType, errorData);
      },
    );
  });

  it.each([
    { method: 'registerTool' as const, executionProperty: 'executor', schemaUpdate: { paramsSchema: {} } },
    { method: 'registerPrompt' as const, executionProperty: 'handler', schemaUpdate: { argsSchema: {} } },
  ])(
    'rewraps $method execution regenerated by a schema update',
    async ({ method, executionProperty, schemaUpdate }) => {
      const server = createV2LikeServer();
      const handlerError = new Error(`${method} schema update failed`);
      const handler = vi.fn(() => {
        throw handlerError;
      });
      const handle = registerHandler(server, method, 'schema-handler', handler);

      wrapAllMCPHandlers(server as unknown as MCPServerInstance);
      wrapExistingHandlers(server as unknown as MCPServerInstance);
      handle.update(schemaUpdate);

      const execute = handle[executionProperty] as TestHandler;
      await expect(Promise.resolve().then(() => execute())).rejects.toBe(handlerError);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(captureErrorMock).toHaveBeenCalledTimes(1);
    },
  );

  it('uses a preregistered resource name without exposing its URI', async () => {
    const handlerError = new Error('private resource failed');
    const readCallback = vi.fn(() => {
      throw handlerError;
    });
    const resource = {
      name: 'customer-profile',
      readCallback,
      update: vi.fn(),
    };
    const server = {
      _registeredPrompts: {},
      _registeredResources: {
        'https://api.example.com/customers/42?api_key=private-token': resource,
      },
      _registeredResourceTemplates: {},
      _registeredTools: {},
      connect: vi.fn(),
    };

    wrapExistingHandlers(server as unknown as MCPServerInstance);

    await expect(Promise.resolve().then(() => resource.readCallback())).rejects.toBe(handlerError);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'resource_execution', {
      resource_name: 'customer-profile',
    });
  });

  it('wraps the two-argument low-level setRequestHandler form', async () => {
    let registeredHandler: TestHandler | undefined;
    const setRequestHandler = vi.fn((...args: unknown[]) => {
      registeredHandler = args[args.length - 1] as TestHandler;
    });
    const server = {
      connect: vi.fn(),
      setRequestHandler,
    };
    const handlerError = new Error('ping request failed');
    const handler = vi.fn().mockRejectedValue(handlerError);

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);
    server.setRequestHandler('ping', handler);

    await expect(registeredHandler?.({}, { mcpReq: { signal: new AbortController().signal } })).rejects.toBe(
      handlerError,
    );
    expect(setRequestHandler).toHaveBeenCalledWith('ping', expect.any(Function));
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'protocol', { method_name: 'ping' });
  });

  it('wraps the three-argument custom low-level setRequestHandler form', () => {
    let registeredHandler: TestHandler | undefined;
    const setRequestHandler = vi.fn((...args: unknown[]) => {
      registeredHandler = args[args.length - 1] as TestHandler;
    });
    const server = {
      connect: vi.fn(),
      setRequestHandler,
    };
    const schemas = {
      params: { vendor: 'standard-schema', version: 1 },
      result: { vendor: 'standard-schema', version: 1 },
    };
    const handlerError = new Error('custom search failed');
    const handler = vi.fn(() => {
      throw handlerError;
    });

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);
    server.setRequestHandler('acme/search', schemas, handler);

    expect(() => registeredHandler?.({}, { mcpReq: { signal: new AbortController().signal } })).toThrow(handlerError);
    expect(setRequestHandler).toHaveBeenCalledWith('acme/search', schemas, expect.any(Function));
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'protocol', { method_name: 'acme/search' });
  });
});
