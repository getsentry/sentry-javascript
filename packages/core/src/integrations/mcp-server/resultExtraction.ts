/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */

import {
  MCP_PROMPT_RESULT_DESCRIPTION,
  MCP_PROMPT_RESULT_KEY_CONTENT,
  MCP_PROMPT_RESULT_KEY_ROLE,
  MCP_PROMPT_RESULT_MESSAGE_CONTENT,
  MCP_PROMPT_RESULT_MESSAGE_COUNT,
  MCP_PROMPT_RESULT_MESSAGE_ROLE,
  MCP_TOOL_RESULT_CONTENT,
  MCP_TOOL_RESULT_CONTENT_COUNT,
  MCP_TOOL_RESULT_CONTENT_TYPE,
  MCP_TOOL_RESULT_DATA_SIZE,
  MCP_TOOL_RESULT_IS_ERROR,
  MCP_TOOL_RESULT_KEY_CONTENT,
  MCP_TOOL_RESULT_KEY_CONTENT_TYPE,
  MCP_TOOL_RESULT_KEY_DATA_SIZE,
  MCP_TOOL_RESULT_KEY_MIME_TYPE,
  MCP_TOOL_RESULT_KEY_NAME,
  MCP_TOOL_RESULT_KEY_RESOURCE_MIME_TYPE,
  MCP_TOOL_RESULT_KEY_RESOURCE_URI,
  MCP_TOOL_RESULT_KEY_URI,
  MCP_TOOL_RESULT_MIME_TYPE,
  MCP_TOOL_RESULT_NAME,
  MCP_TOOL_RESULT_RESOURCE_MIME_TYPE,
  MCP_TOOL_RESULT_RESOURCE_URI,
  MCP_TOOL_RESULT_URI,
} from '@sentry/conventions/attributes';
import { isValidContentItem } from './validation';

/* oxlint-disable typescript/no-deprecated -- Preserve the legacy result attributes for existing consumers. */
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

    const single = content.length === 1;
    const index = String(i);

    if (typeof item.type === 'string') {
      const key = single ? MCP_TOOL_RESULT_CONTENT_TYPE : MCP_TOOL_RESULT_KEY_CONTENT_TYPE.replace('<key>', index);
      attributes[key] = item.type;
    }

    if (includeContent) {
      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          attributes[key] = value;
        }
      };

      safeSet(
        single ? MCP_TOOL_RESULT_MIME_TYPE : MCP_TOOL_RESULT_KEY_MIME_TYPE.replace('<key>', index),
        item.mimeType,
      );
      safeSet(single ? MCP_TOOL_RESULT_URI : MCP_TOOL_RESULT_KEY_URI.replace('<key>', index), item.uri);
      safeSet(single ? MCP_TOOL_RESULT_NAME : MCP_TOOL_RESULT_KEY_NAME.replace('<key>', index), item.name);

      if (typeof item.text === 'string') {
        const attrName = single ? MCP_TOOL_RESULT_CONTENT : MCP_TOOL_RESULT_KEY_CONTENT.replace('<key>', index);
        attributes[attrName] = item.text;
      }

      if (typeof item.data === 'string') {
        const key = single ? MCP_TOOL_RESULT_DATA_SIZE : MCP_TOOL_RESULT_KEY_DATA_SIZE.replace('<key>', index);
        attributes[key] = item.data.length;
      }

      const resource = item.resource;
      if (isValidContentItem(resource)) {
        safeSet(
          single ? MCP_TOOL_RESULT_RESOURCE_URI : MCP_TOOL_RESULT_KEY_RESOURCE_URI.replace('<key>', index),
          resource.uri,
        );
        safeSet(
          single ? MCP_TOOL_RESULT_RESOURCE_MIME_TYPE : MCP_TOOL_RESULT_KEY_RESOURCE_MIME_TYPE.replace('<key>', index),
          resource.mimeType,
        );
      }
    }
  }

  return attributes;
}
/* oxlint-enable typescript/no-deprecated */

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

        if (typeof message.role === 'string') {
          const attrName =
            messages.length === 1
              ? MCP_PROMPT_RESULT_MESSAGE_ROLE
              : MCP_PROMPT_RESULT_KEY_ROLE.replace('<key>', String(i));
          attributes[attrName] = message.role;
        }

        if (isValidContentItem(message.content)) {
          const content = message.content;
          if (typeof content.text === 'string') {
            const attrName =
              messages.length === 1
                ? MCP_PROMPT_RESULT_MESSAGE_CONTENT
                : MCP_PROMPT_RESULT_KEY_CONTENT.replace('<key>', String(i));
            attributes[attrName] = content.text;
          }
        }
      }
    }
  }

  return attributes;
}
