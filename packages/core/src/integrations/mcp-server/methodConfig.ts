/**
 * Method configuration and request processing for MCP server instrumentation
 */

import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROMPT_NAME,
  GEN_AI_PROMPT_VARIABLE_KEY_BASE,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_NAME,
  MCP_PROMPT_NAME,
  MCP_REQUEST_ARGUMENT_KEY_BASE,
  MCP_REQUEST_ARGUMENT_NAME,
  MCP_REQUEST_ARGUMENT_URI,
  MCP_RESOURCE_URI,
  MCP_TOOL_NAME,
} from '@sentry/conventions/attributes';
import { isObjectLike } from '../../utils/is';
import { MAX_MCP_CONTENT_LENGTH, serializeMcpContent } from './serialization';
import type { MethodConfig } from './types';

/**
 * Configuration for MCP methods to extract targets and arguments
 * @internal Maps method names to their extraction configuration
 */
const METHOD_CONFIGS: Record<string, MethodConfig> = {
  'tools/call': {
    targetField: 'name',
    // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy tool name attribute for existing consumers.
    targetAttribute: MCP_TOOL_NAME,
    targetIsLowCardinality: true,
    captureArguments: true,
    argumentsField: 'arguments',
  },
  'resources/read': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI,
    captureUri: true,
  },
  'resources/subscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI,
  },
  'resources/unsubscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI,
  },
  'prompts/get': {
    targetField: 'name',
    // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy prompt name attribute for existing consumers.
    targetAttribute: MCP_PROMPT_NAME,
    targetIsLowCardinality: true,
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
  targetIsLowCardinality: boolean;
  attributes: Record<string, string>;
} {
  const config = METHOD_CONFIGS[method];
  if (!config) {
    return { targetIsLowCardinality: false, attributes: {} };
  }

  const target =
    config.targetField && typeof params?.[config.targetField] === 'string'
      ? (params[config.targetField] as string)
      : undefined;

  return {
    target,
    targetIsLowCardinality: !!config.targetIsLowCardinality,
    attributes: {
      ...(target && config.targetAttribute ? { [config.targetAttribute]: target } : {}),
      ...(method === 'tools/call' && {
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        ...(target && { [GEN_AI_TOOL_NAME]: target }),
      }),
      ...(method === 'prompts/get' && target && { [GEN_AI_PROMPT_NAME]: target }),
    },
  };
}

/**
 * Extracts request arguments based on method type
 * @param method - MCP method name
 * @param params - Method parameters
 * @returns Canonical input attributes alongside legacy request arguments
 */
export function getRequestArguments(method: string, params: Record<string, unknown>): Record<string, string> {
  const args: Record<string, string> = {};
  const config = METHOD_CONFIGS[method];

  if (!config) {
    return args;
  }

  if (config.captureArguments && config.argumentsField && params?.[config.argumentsField]) {
    const argumentsObj = params[config.argumentsField];
    if (isObjectLike(argumentsObj)) {
      if (method === 'tools/call') {
        const serialized = serializeMcpContent(argumentsObj);
        if (serialized !== undefined) {
          args[GEN_AI_TOOL_CALL_ARGUMENTS] = serialized;
        }
      }
      let promptContentLength = 0;
      for (const [key, value] of Object.entries(argumentsObj as Record<string, unknown>)) {
        args[`${MCP_REQUEST_ARGUMENT_KEY_BASE}.${key.toLowerCase()}`] = JSON.stringify(value);
        if (method === 'prompts/get' && typeof value === 'string') {
          promptContentLength += key.length + value.length;
          if (promptContentLength <= MAX_MCP_CONTENT_LENGTH) {
            args[`${GEN_AI_PROMPT_VARIABLE_KEY_BASE}.${key}`] = value;
          }
        }
      }
    }
  }

  if (config.captureUri && params?.uri) {
    args[MCP_REQUEST_ARGUMENT_URI] = JSON.stringify(params.uri);
  }

  if (config.captureName && params?.name) {
    args[MCP_REQUEST_ARGUMENT_NAME] = JSON.stringify(params.name);
  }

  return args;
}
