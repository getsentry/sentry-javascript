import { beforeEach, describe, expect, it } from 'vitest';
import type { Span } from '../../../src';
import {
  extractLLMFromParams,
  extractModelMetadata,
  extractTokenUsageFromMessage,
  extractToolCalls,
  extractToolsFromCompiledGraph,
  setResponseAttributes,
} from '../../../src/tracing/langgraph/utils';

describe('extractLLMFromParams', () => {
  it('handles invalid args or missing llm object', () => {
    // @ts-expect-error should be arguments array, at least.
    expect(extractLLMFromParams({})).toBe(null);
    expect(extractLLMFromParams([])).toBe(null);
    expect(extractLLMFromParams([null])).toBe(null);
    expect(extractLLMFromParams([{}])).toBe(null);
    expect(extractLLMFromParams([{ llm: false }])).toBe(null);
    expect(extractLLMFromParams([{ llm: 123 }])).toBe(null);
    expect(extractLLMFromParams([{ llm: {} }])).toBe(null);
  });
  it('extracts llm object if found', () => {
    expect(extractLLMFromParams([{ llm: { modelName: 'model-name-1' } }])).toStrictEqual({ modelName: 'model-name-1' });
  });
});

describe('extractToolCalls', () => {
  it('returns null for missing/empty messages', () => {
    expect(extractToolCalls(null)).toBe(null);
    expect(extractToolCalls([])).toBe(null);
    expect(extractToolCalls([{}])).toBe(null);
    expect(extractToolCalls([{ tool_calls: null }])).toBe(null);
    expect(extractToolCalls([{ tool_calls: [] }])).toBe(null);
  });
  it('extracts tool call from messages array', () => {
    expect(
      extractToolCalls([
        { tool_calls: [{ name: 'tool a' }] },
        { tool_calls: [{ name: 'tool b' }, { name: 'tool c' }] },
      ]),
    ).toStrictEqual([{ name: 'tool a' }, { name: 'tool b' }, { name: 'tool c' }]);
  });
});

describe('extractTokenUsageFromMessage', () => {
  it('extracts from usage_metadata', () => {
    const inputs = [{}, { input_tokens: 10 }];
    const outputs = [{}, { output_tokens: 20 }];
    const totals = [{}, { total_tokens: 30 }];
    for (const i of inputs) {
      for (const o of outputs) {
        for (const t of totals) {
          expect(
            extractTokenUsageFromMessage({
              usage_metadata: {
                ...i,
                ...o,
                ...t,
              },
            }),
          ).toStrictEqual({
            inputTokens: i?.input_tokens ?? 0,
            outputTokens: o?.output_tokens ?? 0,
            totalTokens: t?.total_tokens ?? 0,
          });
        }
      }
    }
  });
  it('falls back to response_metadata', () => {
    const inputs = [{}, { promptTokens: 10 }];
    const outputs = [{}, { completionTokens: 20 }];
    const totals = [{}, { totalTokens: 30 }];
    for (const i of inputs) {
      for (const o of outputs) {
        for (const t of totals) {
          expect(
            extractTokenUsageFromMessage({
              response_metadata: {
                // @ts-expect-error using old tokenUsage field
                tokenUsage: {
                  ...i,
                  ...o,
                  ...t,
                },
              },
            }),
          ).toStrictEqual({
            inputTokens: i?.promptTokens ?? 0,
            outputTokens: o?.completionTokens ?? 0,
            totalTokens: t?.totalTokens ?? 0,
          });
        }
      }
    }
  });
});

describe('extractModelMetadata', () => {
  let attributes: Record<string, any> = {};
  const span = {
    setAttribute(key: string, value: unknown) {
      attributes[key] = value;
    },
  } as unknown as Span;
  beforeEach(() => (attributes = {}));

  it('handles lacking metadata ok', () => {
    extractModelMetadata(span, {});
    expect(attributes).toStrictEqual({});
  });

  it('extracts response model name from metadata', () => {
    extractModelMetadata(span, {
      response_metadata: {
        model_name: 'model-name',
        finish_reason: 'stop',
      },
    });
    expect(attributes).toStrictEqual({
      'gen_ai.response.model': 'model-name',
      'gen_ai.response.finish_reasons': ['stop'],
    });
  });
});

describe('extractToolsFromCompiledGraph', () => {
  it('returns null if no tools found', () => {
    expect(extractToolsFromCompiledGraph({})).toBe(null);
    expect(
      extractToolsFromCompiledGraph({
        builder: { nodes: { tools: { runnable: {} } } },
      }),
    ).toBe(null);
    expect(
      extractToolsFromCompiledGraph({
        // @ts-expect-error Wants LangGraphTool[]
        builder: { nodes: { tools: { runnable: { tools: 'not an array' } } } },
      }),
    ).toBe(null);
    expect(
      extractToolsFromCompiledGraph({
        builder: { nodes: { tools: { runnable: { tools: [] } } } },
      }),
    ).toBe(null);
  });
  it('returns the tools found', () => {
    expect(
      extractToolsFromCompiledGraph({
        builder: {
          nodes: {
            tools: {
              runnable: {
                tools: [
                  {},
                  { lc_kwargs: { name: 'name' } },
                  { lc_kwargs: { name: 'name', description: 'desc' } },
                  { lc_kwargs: { name: 'name', description: 'desc', schema: 'schema' } },
                ],
              },
            },
          },
        },
      }),
    ).toStrictEqual([
      { name: undefined, description: undefined, schema: undefined },
      { name: 'name', description: undefined, schema: undefined },
      { name: 'name', description: 'desc', schema: undefined },
      { name: 'name', description: 'desc', schema: 'schema' },
    ]);
  });
});

describe('setResponseAttribute', () => {
  let attributes: Record<string, any> = {};
  const span = {
    setAttribute(key: string, value: unknown) {
      attributes[key] = value;
    },
  } as unknown as Span;
  beforeEach(() => (attributes = {}));

  it('handles lack of messages', () => {
    setResponseAttributes(span, [], undefined);
    expect(attributes).toStrictEqual({});

    setResponseAttributes(span, null, undefined);
    expect(attributes).toStrictEqual({});

    setResponseAttributes(span, null, {});
    expect(attributes).toStrictEqual({});

    setResponseAttributes(span, null, { messages: null });
    expect(attributes).toStrictEqual({});

    // no new messages
    setResponseAttributes(span, [{}], { messages: [{}] });
    expect(attributes).toStrictEqual({});
    setResponseAttributes(span, [], { messages: [] });
    expect(attributes).toStrictEqual({});

    // @ts-expect-error cover excessive type safety case
    setResponseAttributes(span, { length: undefined }, []);
    expect(attributes).toStrictEqual({});
  });

  it('extracts tool calls', () => {
    setResponseAttributes(span, [], {
      messages: [{ tool_calls: [{ name: 'tool a' }] }],
    });
    expect(attributes).toStrictEqual({
      'gen_ai.response.text': '[{"role":"user"}]',
      'gen_ai.response.tool_calls': JSON.stringify([{ name: 'tool a' }]),
    });
  });

  it('extracts token usage', () => {
    setResponseAttributes(span, [], {
      messages: [
        {
          usage_metadata: {
            input_tokens: 1,
            output_tokens: 2,
            total_tokens: 3,
          },
        },
      ],
    });
    expect(attributes).toStrictEqual({
      'gen_ai.response.text': '[{"role":"user"}]',
      'gen_ai.usage.input_tokens': 1,
      'gen_ai.usage.output_tokens': 2,
      'gen_ai.usage.total_tokens': 3,
    });
  });

  it('extracts model metadata', () => {
    setResponseAttributes(span, [], {
      messages: [
        {
          response_metadata: {
            model_name: 'model-name-1',
            finish_reason: 'stop',
          },
        },
      ],
    });
    expect(attributes).toStrictEqual({
      'gen_ai.response.text': '[{"role":"user"}]',
      'gen_ai.response.model': 'model-name-1',
      'gen_ai.response.finish_reasons': ['stop'],
    });
  });
});
