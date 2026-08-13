/**
 * Method configuration and request processing for MCP server instrumentation
 */

import { isPlainObject } from '../../utils/is';
import {
  LEGACY_MCP_PROMPT_NAME_ATTRIBUTE,
  LEGACY_MCP_TOOL_NAME_ATTRIBUTE,
  MCP_PROMPT_VARIABLE_ATTRIBUTE_PREFIX,
  MCP_PROMPT_NAME_ATTRIBUTE,
  MCP_REQUEST_ARGUMENT,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_ARGUMENTS_ATTRIBUTE,
  MCP_TOOL_NAME_ATTRIBUTE,
} from './attributes';
import { getBoundedMcpString, serializeLegacyMcpValue, serializeMcpValue } from './serialization';
import type { McpAttributes, MethodConfig } from './types';

const MAX_CAPTURED_ARGUMENTS = 32;
const MAX_ARGUMENT_NAME_LENGTH = 128;

/**
 * Configuration for MCP methods to extract targets and arguments
 * @internal Maps method names to their extraction configuration
 */
const METHOD_CONFIGS: Record<string, MethodConfig> = {
  'tools/call': {
    targetField: 'name',
    targetAttribute: MCP_TOOL_NAME_ATTRIBUTE,
    legacyTargetAttribute: LEGACY_MCP_TOOL_NAME_ATTRIBUTE,
    includeTargetInSpanName: true,
    captureArguments: true,
    argumentsField: 'arguments',
  },
  'resources/read': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
    captureUri: true,
  },
  'resources/subscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
  },
  'resources/unsubscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
  },
  'prompts/get': {
    targetField: 'name',
    targetAttribute: MCP_PROMPT_NAME_ATTRIBUTE,
    legacyTargetAttribute: LEGACY_MCP_PROMPT_NAME_ATTRIBUTE,
    includeTargetInSpanName: true,
    captureName: true,
    captureArguments: true,
    argumentsField: 'arguments',
  },
};

/**
 * Extracts target info from method and params based on method type
 * @param method - MCP method name
 * @param params - Method parameters
 * @returns Target name and attributes for span instrumentation
 */
export function extractTargetInfo(
  method: string,
  params: Record<string, unknown>,
): {
  target?: string;
  includeTargetInSpanName?: boolean;
  attributes: Record<string, string>;
} {
  const config = METHOD_CONFIGS[method];
  if (!config) {
    return { attributes: {} };
  }

  const target =
    config.targetField && typeof params?.[config.targetField] === 'string'
      ? getBoundedMcpString(params[config.targetField] as string)
      : undefined;

  return {
    target,
    includeTargetInSpanName: config.includeTargetInSpanName,
    attributes:
      target && config.targetAttribute
        ? {
            [config.targetAttribute]: target,
            ...(config.legacyTargetAttribute ? { [config.legacyTargetAttribute]: target } : {}),
          }
        : {},
  };
}

/**
 * Extracts request arguments based on method type
 * @param method - MCP method name
 * @param params - Method parameters
 * @returns Arguments as span attributes with mcp.request.argument prefix
 */
export function getRequestArguments(method: string, params: Record<string, unknown>): McpAttributes {
  const args: McpAttributes = {};
  const config = METHOD_CONFIGS[method];

  if (!config) {
    return args;
  }

  if (config.captureArguments && config.argumentsField && params[config.argumentsField] !== undefined) {
    const argumentsObj = params[config.argumentsField];
    const serializedArguments = isPlainObject(argumentsObj) ? serializeMcpValue(argumentsObj) : undefined;

    if (method === 'tools/call' && serializedArguments !== undefined) {
      args[MCP_TOOL_ARGUMENTS_ATTRIBUTE] = serializedArguments;
    }

    if (isPlainObject(argumentsObj)) {
      for (const [key, value] of Object.entries(argumentsObj).slice(0, MAX_CAPTURED_ARGUMENTS)) {
        const boundedKey = getBoundedMcpString(key, MAX_ARGUMENT_NAME_LENGTH);
        const legacySerializedValue = serializeLegacyMcpValue(value);
        const serializedValue = serializeMcpValue(value);
        if (legacySerializedValue !== undefined) {
          args[`${MCP_REQUEST_ARGUMENT}.${boundedKey.toLowerCase()}`] = legacySerializedValue;
        }
        if (serializedValue !== undefined) {
          if (method === 'prompts/get') {
            args[`${MCP_PROMPT_VARIABLE_ATTRIBUTE_PREFIX}.${boundedKey}`] = serializedValue;
          }
        }
      }
    }
  }

  if (config.captureUri && params.uri !== undefined) {
    const uri = serializeLegacyMcpValue(params.uri);
    if (uri !== undefined) {
      args[`${MCP_REQUEST_ARGUMENT}.uri`] = uri;
    }
  }

  if (config.captureName && params.name !== undefined) {
    const name = serializeLegacyMcpValue(params.name);
    if (name !== undefined) {
      args[`${MCP_REQUEST_ARGUMENT}.name`] = name;
    }
  }

  return args;
}
