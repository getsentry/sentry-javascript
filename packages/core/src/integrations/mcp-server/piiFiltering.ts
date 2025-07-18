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
  MCP_REQUEST_ARGUMENT,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
} from './attributes';

/**
 * PII attributes that should be removed when sendDefaultPii is false
 * @internal
 */
const PII_ATTRIBUTES = new Set([
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
]);

/**
 * Removes PII attributes from span data when sendDefaultPii is false
 * @param spanData - Raw span attributes
 * @param sendDefaultPii - Whether to include PII data
 * @returns Filtered span attributes
 */
export function filterMcpPiiFromSpanData(
  spanData: Record<string, unknown>,
  sendDefaultPii: boolean,
): Record<string, SpanAttributeValue | undefined> {
  if (sendDefaultPii) {
    return spanData as Record<string, SpanAttributeValue | undefined>;
  }

  return Object.fromEntries(
    Object.entries(spanData).filter(([key]) => {
      const isPiiAttribute = PII_ATTRIBUTES.has(key) || key.startsWith(`${MCP_REQUEST_ARGUMENT}.`);
      return !isPiiAttribute;
    }),
  ) as Record<string, SpanAttributeValue | undefined>;
}
