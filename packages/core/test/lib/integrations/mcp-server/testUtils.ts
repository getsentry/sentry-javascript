import type { Client } from '../../../../src/client';
import { vi } from 'vitest';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

/**
 * Creates a mock Sentry client with getDataCollectionOptions for use in MCP server tests.
 * @param userInfo - Whether user identity data (IP, port) is collected. Default: true
 * @param genAI - Whether AI inputs/outputs are recorded. Defaults to match userInfo.
 */
export function createMockClient(userInfo = true, genAI?: { inputs: boolean; outputs: boolean }): Client {
  const genAIOptions = genAI ?? { inputs: userInfo, outputs: userInfo };
  return {
    getOptions: () => ({}),
    getDataCollectionOptions: () => ({
      userInfo,
      cookies: true,
      httpHeaders: { request: true, response: true },
      httpBodies: [],
      queryParams: true,
      genAI: genAIOptions,
      stackFrameVariables: true,
      frameContextLines: 5,
    }),
    getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
    emit: vi.fn(),
  } as unknown as Client;
}

/**
 * Creates a real TestClient configured with the legacy sendDefaultPii flag.
 * Use this in tests that verify the sendDefaultPii → dataCollection bridge still works.
 */
export function createTestClientWithSendDefaultPii(sendDefaultPii: boolean): Client {
  return new TestClient(getDefaultTestClientOptions({ dsn: 'https://key@sentry.io/1', sendDefaultPii }));
}

/**
 * Create a mock MCP server instance for testing (legacy API: tool/resource/prompt)
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
 * Create a mock MCP server that simulates already having tools/resources/prompts registered
 * (i.e. wrapMcpServerWithSentry is called after registration). Mirrors the internal shape
 * used by McpServer v2: tools have an `executor`, resources/prompts have `readCallback`/`handler`.
 */
export function createMockMcpServerWithPreregisteredHandlers() {
  const toolExecutor = vi.fn().mockResolvedValue({ content: [] });
  const resourceReadCallback = vi.fn().mockResolvedValue({ contents: [] });
  const resourceTemplateReadCallback = vi.fn().mockResolvedValue({ contents: [] });
  const promptHandler = vi.fn().mockResolvedValue({ messages: [] });

  return {
    registerTool: vi.fn(),
    registerResource: vi.fn(),
    registerPrompt: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    server: { setRequestHandler: vi.fn() },
    // Simulated internal registries (mirrors McpServer v2 private fields)
    _registeredTools: {
      'my-tool': { executor: toolExecutor },
    },
    _registeredResources: {
      'res://my-resource': { readCallback: resourceReadCallback },
    },
    _registeredResourceTemplates: {
      'my-template': { readCallback: resourceTemplateReadCallback },
    },
    _registeredPrompts: {
      'my-prompt': { handler: promptHandler },
    },
    // Expose the original fns so tests can assert wrapping happened
    _originals: { toolExecutor, resourceReadCallback, resourceTemplateReadCallback, promptHandler },
  };
}

/**
 * Create a mock MCP server instance using the new register* API (SDK >=1.x / 2.x)
 */
export function createMockMcpServerWithRegisterApi() {
  return {
    registerResource: vi.fn(),
    registerTool: vi.fn(),
    registerPrompt: vi.fn(),
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

/**
 * Create a mock wrapper transport that simulates the NodeStreamableHTTPServerTransport pattern.
 *
 * NodeStreamableHTTPServerTransport wraps WebStandardStreamableHTTPServerTransport and proxies
 * onmessage, onclose, onerror via getters/setters, while send delegates to the inner transport.
 * This causes the Sentry instrumentation to see different `this` values in onmessage vs send,
 * which is the bug we're testing the fix for.
 *
 * @see https://github.com/getsentry/sentry-mcp/issues/767
 */
export function createMockWrapperTransport(sessionId = 'wrapper-session-123') {
  // Inner transport (simulates WebStandardStreamableHTTPServerTransport)
  // Note: onmessage/onclose/onerror must be initialized to functions so that
  // wrapTransportOnMessage/etc. will wrap them (they check for truthiness)
  const innerTransport = {
    onmessage: vi.fn() as ((message: unknown, extra?: unknown) => void) | undefined,
    onclose: vi.fn() as (() => void) | undefined,
    onerror: vi.fn() as ((error: Error) => void) | undefined,
    send: vi.fn().mockResolvedValue(undefined),
    sessionId: sessionId as string | undefined,
  };

  // Outer wrapper transport (simulates NodeStreamableHTTPServerTransport)
  // Uses Object.defineProperty to create getter/setter pairs that proxy to inner transport
  const wrapperTransport = {
    send: async (message: unknown, _options?: unknown) => innerTransport.send(message, _options),
  } as {
    sessionId: string | undefined;
    onmessage: ((message: unknown, extra?: unknown) => void) | undefined;
    onclose: (() => void) | undefined;
    onerror: ((error: Error) => void) | undefined;
    send: (message: unknown, options?: unknown) => Promise<void>;
  };

  // Define getter/setter pairs that proxy to inner transport
  Object.defineProperty(wrapperTransport, 'sessionId', {
    get: () => innerTransport.sessionId,
    enumerable: true,
  });

  Object.defineProperty(wrapperTransport, 'onmessage', {
    get: () => innerTransport.onmessage,
    set: (handler: ((message: unknown, extra?: unknown) => void) | undefined) => {
      innerTransport.onmessage = handler;
    },
    enumerable: true,
  });

  Object.defineProperty(wrapperTransport, 'onclose', {
    get: () => innerTransport.onclose,
    set: (handler: (() => void) | undefined) => {
      innerTransport.onclose = handler;
    },
    enumerable: true,
  });

  Object.defineProperty(wrapperTransport, 'onerror', {
    get: () => innerTransport.onerror,
    set: (handler: ((error: Error) => void) | undefined) => {
      innerTransport.onerror = handler;
    },
    enumerable: true,
  });

  return {
    /** The outer wrapper transport (what users pass to server.connect()) */
    wrapper: wrapperTransport,
    /** The inner transport (what onmessage actually runs on due to getter/setter) */
    inner: innerTransport,
  };
}
