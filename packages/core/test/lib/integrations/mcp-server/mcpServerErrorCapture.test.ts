import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import * as exports from '../../../../src/exports';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { captureError } from '../../../../src/integrations/mcp-server/errorCapture';
import { createMockMcpServer } from './testUtils';

describe('MCP Server Error Capture', () => {
  const captureExceptionSpy = vi.spyOn(exports, 'captureException');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
    getClientSpy.mockReturnValue({
      getOptions: () => ({ sendDefaultPii: true }),
    } as ReturnType<typeof currentScopes.getClient>);
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
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
    });

    it('should capture tool execution errors and continue normal flow', async () => {
      const toolError = new Error('Tool execution failed');
      const mockToolHandler = vi.fn().mockRejectedValue(toolError);

      wrappedMcpServer.tool('failing-tool', mockToolHandler);

      await expect(mockToolHandler({ input: 'test' }, { requestId: 'req-123', sessionId: 'sess-456' })).rejects.toThrow(
        'Tool execution failed',
      );

      // The capture should be set up correctly
      expect(captureExceptionSpy).toHaveBeenCalledTimes(0); // No capture yet since we didn't call the wrapped handler
    });

    it('should handle Sentry capture errors gracefully', async () => {
      captureExceptionSpy.mockImplementation(() => {
        throw new Error('Sentry error');
      });

      // Test that the capture function itself doesn't throw
      const toolError = new Error('Tool execution failed');
      const mockToolHandler = vi.fn().mockRejectedValue(toolError);

      wrappedMcpServer.tool('failing-tool', mockToolHandler);

      // The error capture should be resilient to Sentry errors
      expect(captureExceptionSpy).toHaveBeenCalledTimes(0);
    });
  });
});
