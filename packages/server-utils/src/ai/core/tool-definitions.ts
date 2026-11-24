import { debug, isObjectLike } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

/** A `gen_ai.tool.definitions` entry in the shape documented by the Sentry conventions. */
interface GenAiToolDefinition {
  type: string;
  name: string;
  description?: string;
  parameters?: unknown;
}

/**
 * Serializes provider tool definitions as the `{ type, name, description, parameters }` entries of
 * `gen_ai.tool.definitions`, or returns `undefined` if there are none.
 *
 * Function tools come in several shapes: OpenAI Chat Completions and Mistral nest them under
 * `function`, Anthropic puts the schema in `input_schema`, Bedrock in `inputSchema.json`, Vercel AI
 * in `inputSchema`, Google in `parameters` or `parametersJsonSchema`. A bare string is a tool name.
 * Tools that a provider runs itself (such as OpenAI's `web_search`) have no schema and are kept as they are.
 */
export function getToolDefinitionsAttribute(tools: unknown): string | undefined {
  const definitions = Array.isArray(tools) ? tools.map(toGenAiToolDefinition).filter(tool => tool !== undefined) : [];
  if (!definitions.length) {
    return undefined;
  }
  try {
    return JSON.stringify(definitions);
  } catch (error) {
    DEBUG_BUILD && debug.error('Failed to serialize tool definitions:', error);
    return undefined;
  }
}

function toGenAiToolDefinition(tool: unknown): unknown {
  if (typeof tool === 'string') {
    return { type: 'function', name: tool };
  }
  if (!isObjectLike(tool)) {
    return undefined;
  }
  // Anthropic marks its function tools as `custom`, to tell them apart from its server tools.
  const isFunctionTool =
    tool.type === undefined || tool.type === 'function' || (tool.type === 'custom' && 'input_schema' in tool);
  if (!isFunctionTool) {
    return tool;
  }
  const fn = isObjectLike(tool.function) ? tool.function : tool;
  if (typeof fn.name !== 'string') {
    return undefined;
  }
  const definition: GenAiToolDefinition = { type: 'function', name: fn.name };
  if (typeof fn.description === 'string') {
    definition.description = fn.description;
  }
  const parameters = getToolParameters(fn);
  if (parameters !== undefined) {
    definition.parameters = parameters;
  }
  return definition;
}

function getToolParameters(fn: Record<string, unknown>): unknown {
  const inputSchema =
    isObjectLike(fn.inputSchema) && isObjectLike(fn.inputSchema.json) ? fn.inputSchema.json : fn.inputSchema;
  const schema = fn.parameters ?? fn.input_schema ?? inputSchema ?? fn.parametersJsonSchema ?? fn.schema;
  // A Zod schema serializes to its internals, not to a JSON schema.
  if (!isObjectLike(schema) || '_def' in schema || '_zod' in schema) {
    return undefined;
  }
  return schema;
}
