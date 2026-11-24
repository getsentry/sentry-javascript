import { describe, expect, it } from 'vitest';
import { getToolDefinitionsAttribute } from '../../../../src/ai/core/tool-definitions';

const SCHEMA = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] };
const WEATHER_TOOL = {
  type: 'function',
  name: 'get_weather',
  description: 'Get the weather for a city',
  parameters: SCHEMA,
};

function parse(tools: unknown): unknown {
  const attribute = getToolDefinitionsAttribute(tools);
  return attribute === undefined ? undefined : JSON.parse(attribute);
}

describe('getToolDefinitionsAttribute', () => {
  it.each([
    [
      'OpenAI Chat Completions / Mistral',
      {
        type: 'function',
        function: { name: 'get_weather', description: 'Get the weather for a city', parameters: SCHEMA, strict: true },
      },
    ],
    ['OpenAI Responses', { ...WEATHER_TOOL, strict: true }],
    [
      'Anthropic',
      {
        name: 'get_weather',
        description: 'Get the weather for a city',
        input_schema: SCHEMA,
        cache_control: { type: 'ephemeral' },
      },
    ],
    [
      'Anthropic custom',
      { type: 'custom', name: 'get_weather', description: 'Get the weather for a city', input_schema: SCHEMA },
    ],
    [
      'Bedrock Converse',
      { name: 'get_weather', description: 'Get the weather for a city', inputSchema: { json: SCHEMA } },
    ],
    [
      'Vercel AI',
      { type: 'function', name: 'get_weather', description: 'Get the weather for a city', inputSchema: SCHEMA },
    ],
    ['Google GenAI', { name: 'get_weather', description: 'Get the weather for a city', parametersJsonSchema: SCHEMA }],
    ['LangGraph', { name: 'get_weather', description: 'Get the weather for a city', schema: SCHEMA }],
  ])('converts %s function tools', (_provider, tool) => {
    expect(parse([tool])).toEqual([WEATHER_TOOL]);
  });

  it('converts tool names', () => {
    expect(parse(['get_weather'])).toEqual([{ type: 'function', name: 'get_weather' }]);
  });

  it('omits Zod schemas', () => {
    const zodSchema = { _def: { typeName: 'ZodObject' } };
    expect(parse([{ name: 'get_weather', schema: zodSchema }])).toEqual([{ type: 'function', name: 'get_weather' }]);
  });

  it('keeps provider-executed tools as they are', () => {
    const webSearch = { type: 'web_search_preview', search_context_size: 'low' };
    expect(parse([webSearch, WEATHER_TOOL])).toEqual([webSearch, WEATHER_TOOL]);
  });

  it('drops entries without a name', () => {
    expect(parse([{ description: 'nameless' }, null, WEATHER_TOOL])).toEqual([WEATHER_TOOL]);
  });

  it.each([[undefined], [[]], [{}], [[null]]])('returns undefined for %j', tools => {
    expect(getToolDefinitionsAttribute(tools)).toBeUndefined();
  });
});
