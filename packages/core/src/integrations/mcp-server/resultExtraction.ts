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

/**
 * Build attributes for tool result content items
 * @param content - Array of content items from tool result
 * @returns Attributes extracted from each content item including type, text, mime type, URI, and resource info
 */
function buildAllContentItemAttributes(content: unknown[]): Record<string, string | number> {
  const attributes: Record<string, string | number> = {
    [MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE]: content.length,
  };

  for (const [i, item] of content.entries()) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const contentItem = item as Record<string, unknown>;
    const prefix = content.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

    const safeSet = (key: string, value: unknown): void => {
      if (typeof value === 'string') {
        attributes[`${prefix}.${key}`] = value;
      }
    };

    safeSet('content_type', contentItem.type);
    safeSet('mime_type', contentItem.mimeType);
    safeSet('uri', contentItem.uri);
    safeSet('name', contentItem.name);

    if (typeof contentItem.text === 'string') {
      const text = contentItem.text;
      const maxLength = 500;
      if (text.length > maxLength) {
        attributes[`${prefix}.content`] = `${text.slice(0, maxLength - 3)}...`;
      } else {
        attributes[`${prefix}.content`] = text;
      }
    }

    if (typeof contentItem.data === 'string') {
      attributes[`${prefix}.data_size`] = contentItem.data.length;
    }

    const resource = contentItem.resource;
    if (typeof resource === 'object' && resource !== null) {
      const res = resource as Record<string, unknown>;
      safeSet('resource_uri', res.uri);
      safeSet('resource_mime_type', res.mimeType);
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
  let attributes: Record<string, string | number | boolean> = {};
  if (typeof result !== 'object' || result === null) {
    return attributes;
  }

  const resultObj = result as Record<string, unknown>;
  if (typeof resultObj.isError === 'boolean') {
    attributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = resultObj.isError;
  }
  if (Array.isArray(resultObj.content)) {
    attributes = { ...attributes, ...buildAllContentItemAttributes(resultObj.content) };
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
  if (typeof result !== 'object' || result === null) {
    return attributes;
  }

  const resultObj = result as Record<string, unknown>;

  if (typeof resultObj.description === 'string') {
    attributes[MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE] = resultObj.description;
  }

  if (Array.isArray(resultObj.messages)) {
    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE] = resultObj.messages.length;

    const messages = resultObj.messages;
    for (const [i, message] of messages.entries()) {
      if (typeof message !== 'object' || message === null) {
        continue;
      }

      const messageObj = message as Record<string, unknown>;
      const prefix = messages.length === 1 ? 'mcp.prompt.result' : `mcp.prompt.result.${i}`;

      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_${key}` : `${prefix}.${key}`;
          attributes[attrName] = value;
        }
      };

      safeSet('role', messageObj.role);

      if (typeof messageObj.content === 'object' && messageObj.content !== null) {
        const content = messageObj.content as Record<string, unknown>;
        if (typeof content.text === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_content` : `${prefix}.content`;
          attributes[attrName] = content.text;
        }
      }
    }
  }

  return attributes;
}
