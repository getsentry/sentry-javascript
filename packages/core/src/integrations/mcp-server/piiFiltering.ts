/**
 * PII filtering for MCP server spans
 * Removes sensitive data when sendDefaultPii is false
 */
import type { SpanAttributeValue } from '../../types-hoist/span';
import { MCP_TOOL_RESULT_CONTENT_ATTRIBUTE } from './attributes';

/** PII attributes that should be removed when sendDefaultPii is false */
const PII_ATTRIBUTES = new Set([
  'client.address',
  'client.port',
  'mcp.logging.message',
  'mcp.resource.uri',
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
]);

/**
 * Removes PII attributes from span data when sendDefaultPii is false
 */
export function filterMcpPiiFromSpanData(
  spanData: Record<string, unknown>,
  sendDefaultPii: boolean,
): Record<string, SpanAttributeValue | undefined> {
  if (sendDefaultPii) {
    return spanData as Record<string, SpanAttributeValue | undefined>; // Cast for type safety
  }

  // Use Object.fromEntries with filter for a more functional approach
  return Object.fromEntries(
    Object.entries(spanData).filter(([key]) => {
      const isPiiAttribute = PII_ATTRIBUTES.has(key) || key.startsWith('mcp.request.argument.');
      return !isPiiAttribute;
    }),
  ) as Record<string, SpanAttributeValue | undefined>;
}
