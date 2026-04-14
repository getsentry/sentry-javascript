import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import * as tracingModule from '../../../../src/tracing';
import { createMockMcpServer, createMockMcpServerWithRegisterApi } from './testUtils';

describe('wrapMcpServerWithSentry', () => {
  const startSpanSpy = vi.spyOn(tracingModule, 'startSpan');
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock client to return sendDefaultPii:
    getClientSpy.mockReturnValue({
      getOptions: () => ({ sendDefaultPii: true }),
      getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
      emit: vi.fn(),
    } as any);
  });

  it('should return the same instance (modified) if it is a valid MCP server instance', () => {
    const mockMcpServer = createMockMcpServer();
    const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

    expect(wrappedMcpServer).toBe(mockMcpServer);
  });

  it('should return the input unchanged if it is not a valid MCP server instance', () => {
    const invalidMcpServer = {
      resource: () => {},
      tool: () => {},
      // Missing required methods
    };

    const result = wrapMcpServerWithSentry(invalidMcpServer);
    expect(result).toBe(invalidMcpServer);

    // Methods should not be wrapped
    expect(result.resource).toBe(invalidMcpServer.resource);
    expect(result.tool).toBe(invalidMcpServer.tool);

    // No calls to startSpan or startInactiveSpan
    expect(startSpanSpy).not.toHaveBeenCalled();
    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  it('should accept a server with only the new register* API (no legacy methods)', () => {
    const mockServer = createMockMcpServerWithRegisterApi();
    const result = wrapMcpServerWithSentry(mockServer);
    expect(result).toBe(mockServer);
  });

  it('should reject a server with neither legacy nor register* methods', () => {
    const invalidServer = { connect: vi.fn() };
    const result = wrapMcpServerWithSentry(invalidServer);
    expect(result).toBe(invalidServer);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('should not wrap the same instance twice', () => {
    const mockMcpServer = createMockMcpServer();

    const wrappedOnce = wrapMcpServerWithSentry(mockMcpServer);
    const wrappedTwice = wrapMcpServerWithSentry(wrappedOnce);

    expect(wrappedTwice).toBe(wrappedOnce);
  });

  it('should wrap the connect method to intercept transport', () => {
    const mockMcpServer = createMockMcpServer();
    const originalConnect = mockMcpServer.connect;

    const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

    expect(wrappedMcpServer.connect).not.toBe(originalConnect);
    expect(typeof wrappedMcpServer.connect).toBe('function');
  });

  it('should wrap handler methods (tool, resource, prompt)', () => {
    const mockMcpServer = createMockMcpServer();
    const originalTool = mockMcpServer.tool;
    const originalResource = mockMcpServer.resource;
    const originalPrompt = mockMcpServer.prompt;

    const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

    expect(wrappedMcpServer.tool).not.toBe(originalTool);
    expect(wrappedMcpServer.resource).not.toBe(originalResource);
    expect(wrappedMcpServer.prompt).not.toBe(originalPrompt);
  });

  it('should wrap handler methods (registerTool, registerResource, registerPrompt)', () => {
    const mockServer = createMockMcpServerWithRegisterApi();
    const originalRegisterTool = mockServer.registerTool;
    const originalRegisterResource = mockServer.registerResource;
    const originalRegisterPrompt = mockServer.registerPrompt;

    const wrapped = wrapMcpServerWithSentry(mockServer);

    expect(wrapped.registerTool).not.toBe(originalRegisterTool);
    expect(wrapped.registerResource).not.toBe(originalRegisterResource);
    expect(wrapped.registerPrompt).not.toBe(originalRegisterPrompt);
  });

  describe('Handler Wrapping', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
    });

    it('should register tool handlers without throwing errors', () => {
      const toolHandler = vi.fn();

      expect(() => {
        wrappedMcpServer.tool('test-tool', toolHandler);
      }).not.toThrow();
    });

    it('should register resource handlers without throwing errors', () => {
      const resourceHandler = vi.fn();

      expect(() => {
        wrappedMcpServer.resource('test-resource', resourceHandler);
      }).not.toThrow();
    });

    it('should register prompt handlers without throwing errors', () => {
      const promptHandler = vi.fn();

      expect(() => {
        wrappedMcpServer.prompt('test-prompt', promptHandler);
      }).not.toThrow();
    });

    it('should handle multiple arguments when registering handlers', () => {
      const nonFunctionArg = { config: 'value' };

      expect(() => {
        wrappedMcpServer.tool('test-tool', nonFunctionArg, 'other-arg');
      }).not.toThrow();
    });
  });

  describe('Handler Wrapping (register* API)', () => {
    let mockServer: ReturnType<typeof createMockMcpServerWithRegisterApi>;
    let wrappedServer: ReturnType<typeof createMockMcpServerWithRegisterApi>;

    beforeEach(() => {
      mockServer = createMockMcpServerWithRegisterApi();
      wrappedServer = wrapMcpServerWithSentry(mockServer);
    });

    it('should register tool handlers via registerTool without throwing errors', () => {
      const toolHandler = vi.fn();

      expect(() => {
        wrappedServer.registerTool('test-tool', {}, toolHandler);
      }).not.toThrow();
    });

    it('should register resource handlers via registerResource without throwing errors', () => {
      const resourceHandler = vi.fn();

      expect(() => {
        wrappedServer.registerResource('test-resource', 'res://test', {}, resourceHandler);
      }).not.toThrow();
    });

    it('should register prompt handlers via registerPrompt without throwing errors', () => {
      const promptHandler = vi.fn();

      expect(() => {
        wrappedServer.registerPrompt('test-prompt', {}, promptHandler);
      }).not.toThrow();
    });
  });
});
