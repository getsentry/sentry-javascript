/**
 * PII filtering for MCP server spans
 *
 * Removes sensitive data when sendDefaultPii is false.
 * Uses configurable attribute filtering to protect user privacy.
 */
import type { SpanAttributeValue } from '../../types-hoist/span';
import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE,
  MCP_PROMPT_RESULT_MESSAGE_CONTENT_ATTRIBUTE,
  MCP_PROMPT_RESULT_PREFIX,
  MCP_REQUEST_ARGUMENT,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
  MCP_TOOL_RESULT_PREFIX,
} from './attributes';

/**
 * PII attributes that should be removed when sendDefaultPii is false
 * @internal
 */
const PII_ATTRIBUTES = new Set([
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE,
  MCP_PROMPT_RESULT_MESSAGE_CONTENT_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
]);

/**
 * Checks if an attribute key should be considered PII.
 *
 * Returns true for:
 * - Explicit PII attributes (client.address, client.port, mcp.logging.message, etc.)
 * - All request arguments (mcp.request.argument.*)
 * - Tool and prompt result content (mcp.tool.result.*, mcp.prompt.result.*) except metadata
 *
 * Preserves metadata attributes ending with _count, _error, or .is_error as they don't contain sensitive data.
 *
 * @param key - Attribute key to evaluate
 * @returns true if the attribute should be filtered out (is PII), false if it should be preserved
 * @internal
 */
function isPiiAttribute(key: string): boolean {
  if (PII_ATTRIBUTES.has(key)) {
    return true;
  }

  if (key.startsWith(`${MCP_REQUEST_ARGUMENT}.`)) {
    return true;
  }

  if (key.startsWith(`${MCP_TOOL_RESULT_PREFIX}.`) || key.startsWith(`${MCP_PROMPT_RESULT_PREFIX}.`)) {
    if (!key.endsWith('_count') && !key.endsWith('_error') && !key.endsWith('.is_error')) {
      return true;
    }
  }

  return false;
}

/**
 * Removes PII attributes from span data when sendDefaultPii is false
 * @param spanData - Raw span attributes
 * @param sendDefaultPii - Whether to include PII data
 * @returns Filtered span attributes
 */
export function filterMcpPiiFromSpanData(
  spanData: Record<string, unknown>,
  sendDefaultPii: boolean,
): Record<string, SpanAttributeValue> {
  if (sendDefaultPii) {
    return spanData as Record<string, SpanAttributeValue>;
  }

  return Object.entries(spanData).reduce((acc, [key, value]) => {
    if (!isPiiAttribute(key)) {
      acc[key] = value as SpanAttributeValue;
    }
    return acc;
  }, {} as Record<string, SpanAttributeValue>);
}
