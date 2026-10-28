/**
 * Method configuration and request processing for MCP server instrumentation
 */

import {
  MCP_PROMPT_NAME,
  MCP_REQUEST_ARGUMENT_KEY_BASE,
  MCP_REQUEST_ARGUMENT_NAME,
  MCP_REQUEST_ARGUMENT_URI,
  MCP_RESOURCE_URI,
  MCP_TOOL_NAME,
} from '@sentry/conventions/attributes';
import { isObjectLike } from '../../utils/is';
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
    attributes: target && config.targetAttribute ? { [config.targetAttribute]: target } : {},
  };
}

/**
 * Extracts request arguments based on method type
 * @param method - MCP method name
 * @param params - Method parameters
 * @returns Arguments as span attributes with mcp.request.argument prefix
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
      for (const [key, value] of Object.entries(argumentsObj as Record<string, unknown>)) {
        args[`${MCP_REQUEST_ARGUMENT_KEY_BASE}.${key.toLowerCase()}`] = JSON.stringify(value);
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
