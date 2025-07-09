import {
  MCP_TOOL_NAME_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_PROMPT_NAME_ATTRIBUTE,
} from './attributes';
import type { MethodConfig } from './types';

/**
 * Configuration for MCP methods to extract targets and arguments
 */
export const METHOD_CONFIGS: Record<string, MethodConfig> = {
  'tools/call': {
    targetField: 'name',
    targetAttribute: MCP_TOOL_NAME_ATTRIBUTE,
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
    captureName: true,
    captureArguments: true,
    argumentsField: 'arguments',
  },
}; 