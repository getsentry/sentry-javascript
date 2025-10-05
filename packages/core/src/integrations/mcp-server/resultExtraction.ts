/**
 * Result extraction functions for MCP server instrumentation
 *
 * Handles extraction of attributes from tool and prompt execution results.
 */

import {
  MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE,
  MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE,
} from './attributes';
import { filterMediaFromContentArray, filterMediaFromContentItem } from './mediaFiltering';
import { isValidContentItem } from './validation';

function buildAllContentItemAttributes(content: unknown[]): Record<string, string | number | boolean> {
  const filteredContent = filterMediaFromContentArray(content);

  const attributes: Record<string, string | number> = {
    [MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE]: filteredContent.length,
  };

  for (const [i, item] of filteredContent.entries()) {
    if (!isValidContentItem(item)) {
      continue;
    }

    const prefix = filteredContent.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

    const safeSet = (key: string, value: unknown): void => {
      if (typeof value === 'string') {
        attributes[`${prefix}.${key}`] = value;
      }
    };

    safeSet('content_type', item.type);
    safeSet('mime_type', item.mimeType);
    safeSet('uri', item.uri);
    safeSet('name', item.name);

    if (typeof item.text === 'string') {
      attributes[`${prefix}.content`] = item.text;
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

  return attributes;
}

/**
 * Extract tool result attributes for span instrumentation
 * @param result - Tool execution result
 * @returns Attributes extracted from tool result content
 */
export function extractToolResultAttributes(result: unknown): Record<string, string | number | boolean> {
  if (!isValidContentItem(result)) {
    return {};
  }

  const attributes = Array.isArray(result.content) ? buildAllContentItemAttributes(result.content) : {};

  if (typeof result.isError === 'boolean') {
    attributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = result.isError;
  }

  return attributes;
}

/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @returns Attributes extracted from prompt result
 */
export function extractPromptResultAttributes(result: unknown): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  if (!isValidContentItem(result)) {
    return attributes;
  }

  if (typeof result.description === 'string') {
    attributes[MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE] = result.description;
  }

  if (Array.isArray(result.messages)) {
    const filteredMessages = result.messages
      .map(message => filterMediaFromContentItem(message))
      .filter(message => message !== null);

    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE] = filteredMessages.length;

    for (const [i, message] of filteredMessages.entries()) {
      if (!isValidContentItem(message)) {
        continue;
      }

      const prefix = filteredMessages.length === 1 ? 'mcp.prompt.result' : `mcp.prompt.result.${i}`;

      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          const attrName = filteredMessages.length === 1 ? `${prefix}.message_${key}` : `${prefix}.${key}`;
          attributes[attrName] = value;
        }
      };

      safeSet('role', message.role);

      if (isValidContentItem(message.content)) {
        const content = message.content;
        if (typeof content.text === 'string') {
          const attrName = filteredMessages.length === 1 ? `${prefix}.message_content` : `${prefix}.content`;
          attributes[attrName] = content.text;
        }
      }
    }
  }

  return attributes;
}
