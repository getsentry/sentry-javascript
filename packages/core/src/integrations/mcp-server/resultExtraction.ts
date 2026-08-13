/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */

import { isPlainObject } from '../../utils/is';
import {
  ERROR_TYPE_ATTRIBUTE,
  MCP_CACHE_SCOPE_ATTRIBUTE,
  MCP_CACHE_TTL_ATTRIBUTE,
  MCP_PAGINATION_NEXT_CURSOR_PRESENT_ATTRIBUTE,
  MCP_RESOURCE_RESULT_MIME_TYPES_ATTRIBUTE,
  MCP_DISCOVERY_EXTENSION_IDS_ATTRIBUTE,
  MCP_DISCOVERY_PROTOCOL_VERSIONS_ATTRIBUTE,
  MCP_INPUT_REQUEST_COUNT_ATTRIBUTE,
  MCP_INPUT_REQUEST_METHODS_ATTRIBUTE,
  MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE,
  MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE,
  MCP_REQUEST_STATE_PRESENT_ATTRIBUTE,
  MCP_RESULT_COUNT_ATTRIBUTE,
  MCP_RESULT_HAS_MORE_ATTRIBUTE,
  MCP_RESULT_TOTAL_COUNT_ATTRIBUTE,
  MCP_RESULT_TYPE_ATTRIBUTE,
  MCP_SERVER_CAPABILITIES_ATTRIBUTE,
  MCP_SUBSCRIPTION_ID_ATTRIBUTE,
  MCP_TOOL_RESULT_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE,
} from './attributes';
import { getBoundedMcpString, getBoundedMcpStringList, serializeMcpValue } from './serialization';
import type { McpAttributes } from './types';
import { isValidContentItem } from './validation';

const MAX_CAPTURED_RESULT_ITEMS = 32;
const MAX_PROTOCOL_VERSION_LENGTH = 64;
const MCP_SUBSCRIPTION_ID_META_KEY = 'io.modelcontextprotocol/subscriptionId';

/**
 * Build attributes for tool result content items
 * @param content - Array of content items from tool result
 * @param includeContent - Whether to include actual content (text, URIs) or just metadata
 * @returns Attributes extracted from each content item
 */
function buildAllContentItemAttributes(content: unknown[], includeContent: boolean): McpAttributes {
  const attributes: McpAttributes = {
    [MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE]: content.length,
  };

  for (const [i, item] of content.slice(0, MAX_CAPTURED_RESULT_ITEMS).entries()) {
    if (!isValidContentItem(item)) {
      continue;
    }

    const prefix = content.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

    if (typeof item.type === 'string') {
      attributes[`${prefix}.content_type`] = getBoundedMcpString(item.type);
    }

    if (includeContent) {
      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          attributes[`${prefix}.${key}`] = getBoundedMcpString(value);
        }
      };

      safeSet('mime_type', item.mimeType);
      safeSet('uri', item.uri);
      safeSet('name', item.name);

      if (typeof item.text === 'string') {
        attributes[`${prefix}.content`] = getBoundedMcpString(item.text, 10_000);
      }

      if (typeof item.data === 'string') {
        attributes[`${prefix}.data_size`] = item.data.length;
      }

      const resource = item.resource;
      if (isValidContentItem(resource)) {
        safeSet('resource_uri', resource.uri);
        safeSet('resource_mime_type', resource.mimeType);
      }
    }
  }

  return attributes;
}

/**
 * Extract tool result attributes for span instrumentation
 * @param result - Tool execution result
 * @param recordOutputs - Whether to include actual content or just metadata (counts, error status)
 * @returns Attributes extracted from tool result content
 */
export function extractToolResultAttributes(result: unknown, recordOutputs: boolean): McpAttributes {
  if (!isValidContentItem(result)) {
    return {};
  }

  const attributes = Array.isArray(result.content) ? buildAllContentItemAttributes(result.content, recordOutputs) : {};

  if (typeof result.isError === 'boolean') {
    attributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = result.isError;
    if (result.isError) {
      attributes[ERROR_TYPE_ATTRIBUTE] = 'tool_error';
    }
  }

  const isCompletedResult = result.resultType === undefined || result.resultType === 'complete';
  if (
    recordOutputs &&
    result.isError !== true &&
    isCompletedResult &&
    (result.structuredContent !== undefined || result.content !== undefined)
  ) {
    const structuredContent = result.structuredContent;
    const toolResult =
      structuredContent !== undefined
        ? isPlainObject(structuredContent)
          ? structuredContent
          : { structuredContent }
        : { content: result.content };
    const serializedResult = serializeMcpValue(toolResult);
    if (serializedResult !== undefined) {
      attributes[MCP_TOOL_RESULT_ATTRIBUTE] = serializedResult;
    }
  }

  return attributes;
}

/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @param recordOutputs - Whether to include actual content or just metadata (counts)
 * @returns Attributes extracted from prompt result
 */
export function extractPromptResultAttributes(result: unknown, recordOutputs: boolean): McpAttributes {
  const attributes: McpAttributes = {};
  if (!isValidContentItem(result)) {
    return attributes;
  }

  if (recordOutputs && typeof result.description === 'string') {
    attributes[MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE] = getBoundedMcpString(result.description, 10_000);
  }

  if (Array.isArray(result.messages)) {
    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE] = result.messages.length;

    if (recordOutputs) {
      const messages = result.messages;
      for (const [i, message] of messages.slice(0, MAX_CAPTURED_RESULT_ITEMS).entries()) {
        if (!isValidContentItem(message)) {
          continue;
        }

        const prefix = messages.length === 1 ? 'mcp.prompt.result' : `mcp.prompt.result.${i}`;

        const safeSet = (key: string, value: unknown): void => {
          if (typeof value === 'string') {
            const attrName = messages.length === 1 ? `${prefix}.message_${key}` : `${prefix}.${key}`;
            attributes[attrName] = getBoundedMcpString(value);
          }
        };

        safeSet('role', message.role);

        if (isValidContentItem(message.content)) {
          const content = message.content;
          if (typeof content.text === 'string') {
            const attrName = messages.length === 1 ? `${prefix}.message_content` : `${prefix}.content`;
            attributes[attrName] = getBoundedMcpString(content.text, 10_000);
          }
        }
      }
    }
  }

  return attributes;
}

const RESULT_COLLECTION_FIELDS: Record<string, string> = {
  'tools/list': 'tools',
  'resources/list': 'resources',
  'resources/templates/list': 'resourceTemplates',
  'prompts/list': 'prompts',
};

/** Extracts attributes shared by modern results and extension-defined task results. */
export function extractCommonResultAttributes(method: string, result: unknown): McpAttributes {
  if (!isValidContentItem(result)) {
    return {};
  }

  const attributes: McpAttributes = {};
  if (typeof result.resultType === 'string') {
    attributes[MCP_RESULT_TYPE_ATTRIBUTE] = getBoundedMcpString(result.resultType);
  }
  if (typeof result.ttlMs === 'number' && Number.isFinite(result.ttlMs) && result.ttlMs >= 0) {
    attributes[MCP_CACHE_TTL_ATTRIBUTE] = result.ttlMs;
  }
  if (result.cacheScope === 'public' || result.cacheScope === 'private') {
    attributes[MCP_CACHE_SCOPE_ATTRIBUTE] = result.cacheScope;
  }
  if (typeof result.requestState === 'string') {
    attributes[MCP_REQUEST_STATE_PRESENT_ATTRIBUTE] = true;
  }
  if (isValidContentItem(result._meta)) {
    const subscriptionId = result._meta[MCP_SUBSCRIPTION_ID_META_KEY];
    if (typeof subscriptionId === 'string' || typeof subscriptionId === 'number') {
      attributes[MCP_SUBSCRIPTION_ID_ATTRIBUTE] = getBoundedMcpString(String(subscriptionId));
    }
  }
  const collectionField = RESULT_COLLECTION_FIELDS[method];
  if (collectionField && Array.isArray(result[collectionField])) {
    attributes[MCP_RESULT_COUNT_ATTRIBUTE] = result[collectionField].length;
  }
  if (collectionField && typeof result.nextCursor === 'string') {
    attributes[MCP_PAGINATION_NEXT_CURSOR_PRESENT_ATTRIBUTE] = true;
  }

  if (method === 'resources/read' && Array.isArray(result.contents)) {
    attributes[MCP_RESULT_COUNT_ATTRIBUTE] = result.contents.length;
    const mimeTypes = getBoundedMcpStringList(
      Array.from(
        new Set(
          result.contents
            .slice(0, MAX_CAPTURED_RESULT_ITEMS)
            .map(content => (isValidContentItem(content) ? content.mimeType : undefined))
            .filter((mimeType): mimeType is string => typeof mimeType === 'string'),
        ),
      ).sort(),
    );
    if (mimeTypes.length > 0) {
      attributes[MCP_RESOURCE_RESULT_MIME_TYPES_ATTRIBUTE] = mimeTypes;
    }
  }

  if (method === 'completion/complete' && isValidContentItem(result.completion)) {
    const completion = result.completion;
    if (Array.isArray(completion.values)) {
      attributes[MCP_RESULT_COUNT_ATTRIBUTE] = completion.values.length;
    }
    if (typeof completion.total === 'number' && Number.isFinite(completion.total) && completion.total >= 0) {
      attributes[MCP_RESULT_TOTAL_COUNT_ATTRIBUTE] = completion.total;
    }
    if (typeof completion.hasMore === 'boolean') {
      attributes[MCP_RESULT_HAS_MORE_ATTRIBUTE] = completion.hasMore;
    }
  }

  if (method === 'server/discover') {
    if (Array.isArray(result.supportedVersions)) {
      attributes[MCP_DISCOVERY_PROTOCOL_VERSIONS_ATTRIBUTE] = getBoundedMcpStringList(
        result.supportedVersions,
        MAX_CAPTURED_RESULT_ITEMS,
        MAX_PROTOCOL_VERSION_LENGTH,
      );
    }
    if (isValidContentItem(result.capabilities) && isValidContentItem(result.capabilities.extensions)) {
      attributes[MCP_DISCOVERY_EXTENSION_IDS_ATTRIBUTE] = getBoundedMcpStringList(
        Object.keys(result.capabilities.extensions).sort(),
      );
    }
    if (isValidContentItem(result.capabilities)) {
      attributes[MCP_SERVER_CAPABILITIES_ATTRIBUTE] = getBoundedMcpStringList(
        Object.keys(result.capabilities)
          .filter(capability => capability !== 'experimental' && capability !== 'extensions')
          .sort(),
      );
    }
  }

  if (isValidContentItem(result.inputRequests)) {
    const allInputRequests = Object.values(result.inputRequests);
    const inputRequests = allInputRequests.slice(0, MAX_CAPTURED_RESULT_ITEMS);
    const inputRequestMethods = inputRequests
      .map(inputRequest => (isValidContentItem(inputRequest) ? inputRequest.method : undefined))
      .filter((methodName): methodName is string => typeof methodName === 'string');
    attributes[MCP_INPUT_REQUEST_COUNT_ATTRIBUTE] = allInputRequests.length;
    if (inputRequestMethods.length > 0) {
      attributes[MCP_INPUT_REQUEST_METHODS_ATTRIBUTE] = getBoundedMcpStringList(
        Array.from(new Set(inputRequestMethods)).sort(),
      );
    }
  }

  return attributes;
}
