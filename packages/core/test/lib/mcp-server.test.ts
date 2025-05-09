import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMcpServerWithSentry } from '../../src/mcp-server';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../src/semanticAttributes';
import * as tracingModule from '../../src/tracing';

vi.mock('../../src/tracing');

describe('wrapMcpServerWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error mocking span is annoying
    vi.mocked(tracingModule.startSpan).mockImplementation((_, cb) => cb());
  });

  it('should wrap valid MCP server instance methods with Sentry spans', () => {
    // Create a mock MCP server instance
    const mockResource = vi.fn();
    const mockTool = vi.fn();
    const mockPrompt = vi.fn();

    const mockMcpServer = {
      resource: mockResource,
      tool: mockTool,
      prompt: mockPrompt,
      connect: vi.fn(),
    };

    // Wrap the MCP server
    const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

    // Verify it returns the same instance (modified)
    expect(wrappedMcpServer).toBe(mockMcpServer);

    // Original methods should be wrapped
    expect(wrappedMcpServer.resource).not.toBe(mockResource);
    expect(wrappedMcpServer.tool).not.toBe(mockTool);
    expect(wrappedMcpServer.prompt).not.toBe(mockPrompt);
  });

  it('should return the input unchanged if it is not a valid MCP server instance', () => {
    const invalidMcpServer = {
      // Missing required methods
      resource: () => {},
      tool: () => {},
      // No prompt method
    };

    const result = wrapMcpServerWithSentry(invalidMcpServer);
    expect(result).toBe(invalidMcpServer);

    // Methods should not be wrapped
    expect(result.resource).toBe(invalidMcpServer.resource);
    expect(result.tool).toBe(invalidMcpServer.tool);

    // No calls to startSpan
    expect(tracingModule.startSpan).not.toHaveBeenCalled();
  });

  it('should not wrap the same instance twice', () => {
    const mockMcpServer = {
      resource: vi.fn(),
      tool: vi.fn(),
      prompt: vi.fn(),
    };

    // First wrap
    const wrappedOnce = wrapMcpServerWithSentry(mockMcpServer);

    // Store references to wrapped methods
    const wrappedResource = wrappedOnce.resource;
    const wrappedTool = wrappedOnce.tool;
    const wrappedPrompt = wrappedOnce.prompt;

    // Second wrap
    const wrappedTwice = wrapMcpServerWithSentry(wrappedOnce);

    // Should be the same instance with the same wrapped methods
    expect(wrappedTwice).toBe(wrappedOnce);
    expect(wrappedTwice.resource).toBe(wrappedResource);
    expect(wrappedTwice.tool).toBe(wrappedTool);
    expect(wrappedTwice.prompt).toBe(wrappedPrompt);
  });

  describe('resource method wrapping', () => {
    it('should create a span with proper attributes when resource is called', () => {
      const mockResourceHandler = vi.fn();
      const resourceName = 'test-resource';

      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      wrappedMcpServer.resource(resourceName, {}, mockResourceHandler);

      // The original registration should use a wrapped handler
      expect(mockMcpServer.resource).toHaveBeenCalledWith(resourceName, {}, expect.any(Function));

      // Invoke the wrapped handler to trigger Sentry span
      const wrappedResourceHandler = (mockMcpServer.resource as any).mock.calls[0][2];
      wrappedResourceHandler('test-uri', { foo: 'bar' });

      expect(tracingModule.startSpan).toHaveBeenCalledTimes(1);
      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        {
          name: `mcp-server/resource:${resourceName}`,
          forceTransaction: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'mcp_server.resource': resourceName,
          },
        },
        expect.any(Function),
      );

      // Verify the original handler was called within the span
      expect(mockResourceHandler).toHaveBeenCalledWith('test-uri', { foo: 'bar' });
    });

    it('should call the original resource method directly if name or handler is not valid', () => {
      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      // Call without string name
      wrappedMcpServer.resource({} as any, 'handler');

      // Call without function handler
      wrappedMcpServer.resource('name', 'not-a-function');

      // Original method should be called directly without creating spans
      expect(mockMcpServer.resource).toHaveBeenCalledTimes(2);
      expect(tracingModule.startSpan).not.toHaveBeenCalled();
    });
  });

  describe('tool method wrapping', () => {
    it('should create a span with proper attributes when tool is called', () => {
      const mockToolHandler = vi.fn();
      const toolName = 'test-tool';

      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      wrappedMcpServer.tool(toolName, {}, mockToolHandler);

      // The original registration should use a wrapped handler
      expect(mockMcpServer.tool).toHaveBeenCalledWith(toolName, {}, expect.any(Function));

      // Invoke the wrapped handler to trigger Sentry span
      const wrappedToolHandler = (mockMcpServer.tool as any).mock.calls[0][2];
      wrappedToolHandler({ arg: 'value' }, { foo: 'baz' });

      expect(tracingModule.startSpan).toHaveBeenCalledTimes(1);
      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        {
          name: `mcp-server/tool:${toolName}`,
          forceTransaction: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'mcp_server.tool': toolName,
          },
        },
        expect.any(Function),
      );

      // Verify the original handler was called within the span
      expect(mockToolHandler).toHaveBeenCalledWith({ arg: 'value' }, { foo: 'baz' });
    });

    it('should call the original tool method directly if name or handler is not valid', () => {
      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      // Call without string name
      wrappedMcpServer.tool({} as any, 'handler');

      // Original method should be called directly without creating spans
      expect(mockMcpServer.tool).toHaveBeenCalledTimes(1);
      expect(tracingModule.startSpan).not.toHaveBeenCalled();
    });
  });

  describe('prompt method wrapping', () => {
    it('should create a span with proper attributes when prompt is called', () => {
      const mockPromptHandler = vi.fn();
      const promptName = 'test-prompt';

      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      wrappedMcpServer.prompt(promptName, {}, mockPromptHandler);

      // The original registration should use a wrapped handler
      expect(mockMcpServer.prompt).toHaveBeenCalledWith(promptName, {}, expect.any(Function));

      // Invoke the wrapped handler to trigger Sentry span
      const wrappedPromptHandler = (mockMcpServer.prompt as any).mock.calls[0][2];
      wrappedPromptHandler({ msg: 'hello' }, { data: 123 });

      expect(tracingModule.startSpan).toHaveBeenCalledTimes(1);
      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        {
          name: `mcp-server/prompt:${promptName}`,
          forceTransaction: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'mcp_server.prompt': promptName,
          },
        },
        expect.any(Function),
      );

      // Verify the original handler was called within the span
      expect(mockPromptHandler).toHaveBeenCalledWith({ msg: 'hello' }, { data: 123 });
    });

    it('should call the original prompt method directly if name or handler is not valid', () => {
      const mockMcpServer = {
        resource: vi.fn(),
        tool: vi.fn(),
        prompt: vi.fn(),
        connect: vi.fn(),
      };

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      // Call without function handler
      wrappedMcpServer.prompt('name', 'not-a-function');

      // Original method should be called directly without creating spans
      expect(mockMcpServer.prompt).toHaveBeenCalledTimes(1);
      expect(tracingModule.startSpan).not.toHaveBeenCalled();
    });
  });
});
