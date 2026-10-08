/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */

import {
  MCP_PROMPT_RESULT_DESCRIPTION,
  MCP_PROMPT_RESULT_MESSAGE_CONTENT,
  MCP_PROMPT_RESULT_MESSAGE_COUNT,
  MCP_PROMPT_RESULT_MESSAGE_ROLE,
  MCP_TOOL_RESULT_CONTENT,
  MCP_TOOL_RESULT_CONTENT_COUNT,
  MCP_TOOL_RESULT_IS_ERROR,
} from '@sentry/conventions/attributes';
import { MCP_TOOL_RESULT_PREFIX, MCP_PROMPT_RESULT_PREFIX } from './attributes';
import { isValidContentItem } from './validation';

/**
 * Build attributes for tool result content items
 * @param content - Array of content items from tool result
 * @param includeContent - Whether to include actual content (text, URIs) or just metadata
 * @returns Attributes extracted from each content item
 */
function buildAllContentItemAttributes(
  content: unknown[],
  includeContent: boolean,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number> = {
    [MCP_TOOL_RESULT_CONTENT_COUNT]: content.length,
  };

  for (const [i, item] of content.entries()) {
    if (!isValidContentItem(item)) {
      continue;
    }

    const prefix = content.length === 1 ? MCP_TOOL_RESULT_PREFIX : `${MCP_TOOL_RESULT_PREFIX}.${i}`;

    if (typeof item.type === 'string') {
      attributes[`${prefix}.content_type`] = item.type;
    }

    if (includeContent) {
      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          attributes[`${prefix}.${key}`] = value;
        }
      };

      safeSet('mime_type', item.mimeType);
      safeSet('uri', item.uri);
      safeSet('name', item.name);

      if (typeof item.text === 'string') {
        // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy content attribute for existing consumers.
        const attrName = content.length === 1 ? MCP_TOOL_RESULT_CONTENT : `${prefix}.content`;
        attributes[attrName] = item.text;
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
export function extractToolResultAttributes(
  result: unknown,
  recordOutputs: boolean,
): Record<string, string | number | boolean> {
  if (!isValidContentItem(result)) {
    return {};
  }

  const attributes = Array.isArray(result.content) ? buildAllContentItemAttributes(result.content, recordOutputs) : {};

  if (typeof result.isError === 'boolean') {
    // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy tool result attribute for existing consumers.
    attributes[MCP_TOOL_RESULT_IS_ERROR] = result.isError;
  }

  return attributes;
}

/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @param recordOutputs - Whether to include actual content or just metadata (counts)
 * @returns Attributes extracted from prompt result
 */
export function extractPromptResultAttributes(
  result: unknown,
  recordOutputs: boolean,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  if (!isValidContentItem(result)) {
    return attributes;
  }

  if (recordOutputs && typeof result.description === 'string') {
    attributes[MCP_PROMPT_RESULT_DESCRIPTION] = result.description;
  }

  if (Array.isArray(result.messages)) {
    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT] = result.messages.length;

    if (recordOutputs) {
      const messages = result.messages;
      for (const [i, message] of messages.entries()) {
        if (!isValidContentItem(message)) {
          continue;
        }

        const prefix = messages.length === 1 ? MCP_PROMPT_RESULT_PREFIX : `${MCP_PROMPT_RESULT_PREFIX}.${i}`;

        if (typeof message.role === 'string') {
          const attrName = messages.length === 1 ? MCP_PROMPT_RESULT_MESSAGE_ROLE : `${prefix}.role`;
          attributes[attrName] = message.role;
        }

        if (isValidContentItem(message.content)) {
          const content = message.content;
          if (typeof content.text === 'string') {
            const attrName = messages.length === 1 ? MCP_PROMPT_RESULT_MESSAGE_CONTENT : `${prefix}.content`;
            attributes[attrName] = content.text;
          }
        }
      }
    }
  }

  return attributes;
}
