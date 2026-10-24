import { describe, expect, it } from 'vitest';
import { getRequestArguments } from '../../../../src/integrations/mcp-server/methodConfig';
import { extractToolResultAttributes } from '../../../../src/integrations/mcp-server/resultExtraction';
import { MAX_MCP_CONTENT_LENGTH, serializeMcpContent } from '../../../../src/integrations/mcp-server/serialization';

describe('MCP canonical content attributes', () => {
  it('bounds canonical prompt variables together without changing legacy arguments', () => {
    const Language = 'x'.repeat(MAX_MCP_CONTENT_LENGTH - 'Language'.length);

    expect(getRequestArguments('prompts/get', { arguments: { Language, Topic: 'weather' } })).toEqual({
      'gen_ai.prompt.variable.Language': Language,
      'mcp.request.argument.language': JSON.stringify(Language),
      'mcp.request.argument.topic': JSON.stringify('weather'),
    });
  });

  it('serializes tool arguments as one JSON object while preserving legacy argument values', () => {
    const args = { query: 'foo "bar"', options: { limit: 2 }, tags: ['first', 'second'] };

    expect(getRequestArguments('tools/call', { name: 'search', arguments: args })).toEqual({
      'gen_ai.tool.call.arguments': JSON.stringify(args),
      'mcp.request.argument.query': JSON.stringify(args.query),
      'mcp.request.argument.options': JSON.stringify(args.options),
      'mcp.request.argument.tags': JSON.stringify(args.tags),
    });
  });

  it.each([undefined, 'complete'])('selects successful tool output when resultType is %s', resultType => {
    const content = [{ type: 'text', text: 'Hello' }];
    const structuredContent = { greeting: 'Hello', count: 1 };

    expect(
      extractToolResultAttributes(
        {
          content,
          structuredContent,
          resultType,
          isError: false,
          _meta: { private: 'metadata' },
          requestState: 'opaque',
        },
        true,
      ),
    ).toEqual({
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.content_type': 'text',
      'mcp.tool.result.content': 'Hello',
      'mcp.tool.result.is_error': false,
      'gen_ai.tool.call.result': JSON.stringify({ content, structuredContent }),
    });
  });

  it.each([{ isError: true }, { resultType: 'input_required', requestState: 'opaque' }, { resultType: 'unknown' }])(
    'omits the canonical output for unsuccessful or incomplete results: %j',
    result => {
      const attributes = extractToolResultAttributes(
        { ...result, content: [{ type: 'text', text: 'Need more input' }] },
        true,
      );

      expect(attributes).not.toHaveProperty('gen_ai.tool.call.result');
      expect(attributes['mcp.tool.result.content']).toBe('Need more input');
    },
  );

  it.each([42, 'Hello', [1, 2], null])('preserves structured tool output containing %j', structuredContent => {
    expect(extractToolResultAttributes({ structuredContent }, true)).toEqual({
      'gen_ai.tool.call.result': JSON.stringify({ structuredContent }),
    });
  });

  it('removes metadata at protocol boundaries while preserving structured user data and the original result', () => {
    const result = {
      content: [
        { type: 'text', text: 'Hello', _meta: { private: 'block' } },
        {
          type: 'resource',
          resource: { uri: 'file:///example.txt', text: 'Resource', _meta: { private: 'resource' } },
          _meta: { private: 'embedded block' },
        },
      ],
      structuredContent: { _meta: { userField: 'keep' }, nested: { _meta: 'also keep' } },
    };
    const original = JSON.stringify(result);
    const attributes = extractToolResultAttributes(result, true);

    expect(attributes['gen_ai.tool.call.result']).toBe(
      JSON.stringify({
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'resource', resource: { uri: 'file:///example.txt', text: 'Resource' } },
        ],
        structuredContent: result.structuredContent,
      }),
    );
    expect(JSON.stringify(result)).toBe(original);
  });

  it.each(['resultType', 'structuredContent'])('ignores an unreadable %s without losing legacy metadata', key => {
    const result = { content: [{ type: 'text', text: 'Hello' }] };
    Object.defineProperty(result, key, {
      get() {
        throw new Error('Cannot read result');
      },
    });

    expect(extractToolResultAttributes(result, true)).toEqual({
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.content_type': 'text',
      'mcp.tool.result.content': 'Hello',
    });
  });

  it('keeps metadata but omits both output formats when output capture is disabled', () => {
    expect(
      extractToolResultAttributes(
        { content: [{ type: 'text', text: 'Private output' }], structuredContent: { secret: true }, isError: false },
        false,
      ),
    ).toEqual({
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.content_type': 'text',
      'mcp.tool.result.is_error': false,
    });
  });

  it('omits oversized JSON instead of emitting a truncated document', () => {
    const text = 'x'.repeat(MAX_MCP_CONTENT_LENGTH - JSON.stringify({ text: '' }).length);
    const serialized = serializeMcpContent({ text });

    expect(serialized).toHaveLength(MAX_MCP_CONTENT_LENGTH);
    expect(JSON.parse(serialized!)).toEqual({ text });
    expect(serializeMcpContent({ text: `${text}x` })).toBeUndefined();
  });

  it('omits JSON that cannot be serialized', () => {
    const circular: { value?: unknown } = {};
    circular.value = circular;
    const throwsOnSerialization = {
      toJSON() {
        throw new Error('Cannot serialize');
      },
    };

    expect(serializeMcpContent(circular)).toBeUndefined();
    expect(serializeMcpContent(throwsOnSerialization)).toBeUndefined();
  });
});
