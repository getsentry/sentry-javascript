import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import * as exports from '../../../../src/exports';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { captureError } from '../../../../src/integrations/mcp-server/errorCapture';
import type { MCPHandler } from '../../../../src/integrations/mcp-server/types';
import { createMockClient, createMockMcpServer } from './testUtils';

describe('MCP Server Error Capture', () => {
  const captureExceptionSpy = vi.spyOn(exports, 'captureException');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
    getClientSpy.mockReturnValue(createMockClient(true));
  });

  describe('captureError', () => {
    it('should capture errors with error type', () => {
      const error = new Error('Tool execution failed');

      captureError(error, 'tool_execution');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'tool_execution',
          },
        },
      });
    });

    it('should capture transport errors', () => {
      const error = new Error('Connection failed');

      captureError(error, 'transport');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'transport',
          },
        },
      });
    });

    it('should capture protocol errors', () => {
      const error = new Error('Invalid JSON-RPC request');

      captureError(error, 'protocol');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'protocol',
          },
        },
      });
    });

    it('should capture validation errors', () => {
      const error = new Error('Invalid parameters');

      captureError(error, 'validation');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'validation',
          },
        },
      });
    });

    it('should capture timeout errors', () => {
      const error = new Error('Operation timed out');

      captureError(error, 'timeout');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'timeout',
          },
        },
      });
    });

    it('should capture errors with MCP data for filtering', () => {
      const error = new Error('Tool failed');

      captureError(error, 'tool_execution', { tool_name: 'my-tool' });

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: {
            error_type: 'tool_execution',
            tool_name: 'my-tool',
          },
        },
      });
    });

    it('should not capture when no client is available', () => {
      getClientSpy.mockReturnValue(undefined);

      const error = new Error('Test error');

      captureError(error, 'tool_execution');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('should handle Sentry capture errors gracefully', () => {
      captureExceptionSpy.mockImplementation(() => {
        throw new Error('Sentry error');
      });

      const error = new Error('Test error');

      // Should not throw
      expect(() => captureError(error, 'tool_execution')).not.toThrow();
    });

    it('should handle undefined client gracefully', () => {
      getClientSpy.mockReturnValue(undefined);

      const error = new Error('Test error');

      // Should not throw and not capture
      expect(() => captureError(error, 'tool_execution')).not.toThrow();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Capture Integration', () => {
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let registeredHandler: MCPHandler;

    beforeEach(() => {
      captureExceptionSpy.mockReturnValue('event-id');
      const mockMcpServer = createMockMcpServer();
      mockMcpServer.tool.mockImplementation((_name: string, handler: MCPHandler) => {
        registeredHandler = handler;
      });
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
    });

    it('should not retry a handler after a synchronous error', () => {
      const toolError = new Error('Tool execution failed');
      const mockToolHandler = vi
        .fn()
        .mockImplementationOnce(() => {
          throw toolError;
        })
        .mockReturnValue({ content: [] });
      wrappedMcpServer.tool('failing-tool', mockToolHandler);

      expect(() => registeredHandler()).toThrow(toolError);

      expect(mockToolHandler).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledExactlyOnceWith(toolError, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: { error_type: 'tool_execution', tool_name: 'failing-tool' },
        },
      });
    });

    it('should capture and rethrow asynchronous errors without retrying', async () => {
      const toolError = new Error('Tool execution failed');
      const mockToolHandler = vi.fn().mockRejectedValue(toolError);
      wrappedMcpServer.tool('failing-tool', mockToolHandler);

      await expect(registeredHandler()).rejects.toBe(toolError);

      expect(mockToolHandler).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledExactlyOnceWith(toolError, {
        mechanism: {
          type: 'auto.ai.mcp_server',
          handled: false,
          data: { error_type: 'tool_execution', tool_name: 'failing-tool' },
        },
      });
    });

    it('should not retry a failing handler when Sentry capture also throws', () => {
      captureExceptionSpy.mockImplementation(() => {
        throw new Error('Sentry error');
      });
      const toolError = new Error('Tool execution failed');
      const mockToolHandler = vi.fn(() => {
        throw toolError;
      });
      wrappedMcpServer.tool('failing-tool', mockToolHandler);

      expect(() => registeredHandler()).toThrow(toolError);

      expect(mockToolHandler).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    });

    it('should preserve the handler receiver, arguments, and return value', () => {
      const result = { content: [] };
      const mockToolHandler = vi.fn().mockReturnValue(result);
      const receiver = {};
      const args = { input: 'test' };
      const extra = { requestId: 'req-123', sessionId: 'sess-456' };
      wrappedMcpServer.tool('successful-tool', mockToolHandler);

      expect(registeredHandler.call(receiver, args, extra)).toBe(result);

      expect(mockToolHandler).toHaveBeenCalledExactlyOnceWith(args, extra);
      expect(mockToolHandler.mock.contexts).toEqual([receiver]);
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });
});
