import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureError } from '../../../../src/integrations/mcp-server/errorCapture';
import { wrapAllMCPHandlers, wrapExistingHandlers } from '../../../../src/integrations/mcp-server/handlers';
import type { MCPServerInstance } from '../../../../src/integrations/mcp-server/types';

vi.mock('../../../../src/integrations/mcp-server/errorCapture', () => ({
  captureError: vi.fn(),
}));

type TestHandler = (...args: unknown[]) => unknown;

type LegacyRegistration = Record<string, unknown> & {
  update: (updates: { callback?: TestHandler; name?: string | null }) => void;
};

function createLegacyRegistration(executionProperty: 'handler' | 'callback', handler: TestHandler): LegacyRegistration {
  const registration: LegacyRegistration = {
    [executionProperty]: handler,
    update(updates) {
      if (updates.callback) {
        registration[executionProperty] = updates.callback;
      }
    },
  };
  return registration;
}

describe('legacy MCP handler wrapping', () => {
  const captureErrorMock = vi.mocked(captureError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      errorData: { tool_name: 'legacy-tool' },
      errorType: 'tool_execution' as const,
      executionProperty: 'handler' as const,
      registry: '_registeredTools' as const,
      registrationName: 'legacy-tool',
    },
    {
      errorData: { prompt_name: 'legacy-prompt' },
      errorType: 'prompt_execution' as const,
      executionProperty: 'callback' as const,
      registry: '_registeredPrompts' as const,
      registrationName: 'legacy-prompt',
    },
  ])(
    'wraps a preregistered $registry callback from SDK v1',
    async ({ errorData, errorType, executionProperty, registry, registrationName }) => {
      const handlerError = new Error(`${registrationName} failed`);
      const handler = vi.fn().mockRejectedValue(handlerError);
      const registration = createLegacyRegistration(executionProperty, handler);
      const server = {
        _registeredPrompts: {},
        _registeredResources: {},
        _registeredResourceTemplates: {},
        _registeredTools: {},
        [registry]: { [registrationName]: registration },
        connect: vi.fn(),
      };

      wrapExistingHandlers(server as unknown as MCPServerInstance);

      const execute = registration[executionProperty] as TestHandler;
      await expect(execute({}, { signal: new AbortController().signal })).rejects.toBe(handlerError);
      expect(captureErrorMock).toHaveBeenCalledTimes(1);
      expect(captureErrorMock).toHaveBeenCalledWith(handlerError, errorType, errorData);
    },
  );

  it.each([
    {
      errorData: { tool_name: 'renamed-legacy-handler' },
      errorType: 'tool_execution' as const,
      executionProperty: 'handler' as const,
      registry: '_registeredTools' as const,
      registrationName: 'legacy-tool',
    },
    {
      errorData: { prompt_name: 'renamed-legacy-handler' },
      errorType: 'prompt_execution' as const,
      executionProperty: 'callback' as const,
      registry: '_registeredPrompts' as const,
      registrationName: 'legacy-prompt',
    },
  ])(
    'keeps a preregistered $registry callback instrumented after update',
    async ({ errorData, errorType, executionProperty, registry, registrationName }) => {
      const registration = createLegacyRegistration(executionProperty, vi.fn());
      const server = {
        _registeredPrompts: {},
        _registeredResources: {},
        _registeredResourceTemplates: {},
        _registeredTools: {},
        [registry]: { [registrationName]: registration },
        connect: vi.fn(),
      };
      const handlerError = new Error(`${registrationName} update failed`);
      const updatedHandler = vi.fn().mockRejectedValue(handlerError);

      wrapExistingHandlers(server as unknown as MCPServerInstance);
      registration.update({ callback: updatedHandler, name: 'renamed-legacy-handler' });

      const execute = registration[executionProperty] as TestHandler;
      await expect(execute({}, { signal: new AbortController().signal })).rejects.toBe(handlerError);
      expect(captureErrorMock).toHaveBeenCalledTimes(1);
      expect(captureErrorMock).toHaveBeenCalledWith(handlerError, errorType, errorData);
    },
  );

  it('does not share mutable names when a wrapped callback is reused by another registration', async () => {
    const originalError = new Error('shared callback failed');
    const originalHandler = vi.fn().mockRejectedValue(originalError);
    const firstRegistration = createLegacyRegistration('handler', originalHandler);
    const firstServer = {
      _registeredPrompts: {},
      _registeredResources: {},
      _registeredResourceTemplates: {},
      _registeredTools: { 'first-tool': firstRegistration },
      connect: vi.fn(),
    };

    wrapExistingHandlers(firstServer as unknown as MCPServerInstance);

    const reusedCallback = firstRegistration.handler as TestHandler;
    const secondRegistration = createLegacyRegistration('handler', reusedCallback);
    const secondServer = {
      _registeredPrompts: {},
      _registeredResources: {},
      _registeredResourceTemplates: {},
      _registeredTools: { 'second-tool': secondRegistration },
      connect: vi.fn(),
    };
    wrapExistingHandlers(secondServer as unknown as MCPServerInstance);
    secondRegistration.update({ name: 'renamed-second-tool' });

    await expect((firstRegistration.handler as TestHandler)()).rejects.toBe(originalError);
    expect(captureErrorMock).toHaveBeenCalledWith(originalError, 'tool_execution', { tool_name: 'first-tool' });

    vi.clearAllMocks();
    await expect((secondRegistration.handler as TestHandler)()).rejects.toBe(originalError);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(originalError, 'tool_execution', {
      tool_name: 'renamed-second-tool',
    });
  });

  it('captures once when a legacy facade delegates to registerTool', async () => {
    let registration: LegacyRegistration | undefined;
    const server = {
      connect: vi.fn(),
      registerTool(_name: string, _config: unknown, callback: TestHandler) {
        registration = createLegacyRegistration('handler', callback);
        return registration;
      },
      tool(name: string, callback: TestHandler) {
        return this.registerTool(name, {}, callback);
      },
    };
    const handlerError = new Error('delegated handler failed');
    const handler = vi.fn().mockRejectedValue(handlerError);

    wrapAllMCPHandlers(server as unknown as MCPServerInstance);
    server.tool('delegated-tool', handler);

    await expect((registration?.handler as TestHandler)()).rejects.toBe(handlerError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(handlerError, 'tool_execution', {
      tool_name: 'delegated-tool',
    });
  });
});
