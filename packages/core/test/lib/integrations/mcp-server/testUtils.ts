import { vi } from 'vitest';

/**
 * Create a mock MCP server instance for testing
 */
export function createMockMcpServer() {
  return {
    resource: vi.fn(),
    tool: vi.fn(),
    prompt: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    server: {
      setRequestHandler: vi.fn(),
    },
  };
}

/**
 * Create a mock HTTP transport (StreamableHTTPServerTransport)
 * Uses exact naming pattern from the official SDK
 */
export function createMockTransport() {
  class StreamableHTTPServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    onerror = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'test-session-123';
    protocolVersion = '2025-06-18';
  }

  return new StreamableHTTPServerTransport();
}

/**
 * Create a mock stdio transport (StdioServerTransport)
 * Uses exact naming pattern from the official SDK
 */
export function createMockStdioTransport() {
  class StdioServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'stdio-session-456';
  }

  return new StdioServerTransport();
}

/**
 * Create a mock SSE transport (SSEServerTransport)
 * For backwards compatibility testing
 */
export function createMockSseTransport() {
  class SSEServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'sse-session-789';
  }

  return new SSEServerTransport();
}
