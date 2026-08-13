/**
 * PII filtering for MCP server spans
 *
 * Removes network-level sensitive data when dataCollection.userInfo is false.
 * Input/output data (request arguments, tool/prompt results) is controlled
 * separately via recordInputs/recordOutputs options.
 */
import type { SpanAttributeValue } from '../../types/span';
import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_REQUEST_ARGUMENT,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_TOOL_RESULT_ATTRIBUTE,
} from './attributes';

/**
 * Network PII attributes that should be removed when dataCollection.userInfo is false
 * @internal
 */
const NETWORK_PII_ATTRIBUTES = new Set([
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  `${MCP_REQUEST_ARGUMENT}.uri`,
]);

/**
 * Checks if an attribute key should be considered network PII.
 *
 * Returns true for:
 * - client.address (IP address)
 * - client.port (port number)
 * - mcp.resource.uri (potentially sensitive URIs)
 *
 * @param key - Attribute key to evaluate
 * @returns true if the attribute should be filtered out (is network PII), false if it should be preserved
 * @internal
 */
function isNetworkPiiAttribute(key: string): boolean {
  return NETWORK_PII_ATTRIBUTES.has(key) || key.endsWith('.uri') || key.endsWith('.resource_uri');
}

/**
 * Removes network PII attributes from span data when dataCollection.userInfo is false
 * @param spanData - Raw span attributes
 * @param userInfo - Whether to include user identity data (IP, port, resource URIs)
 * @returns Filtered span attributes
 */
export function filterMcpPiiFromSpanData(
  spanData: Record<string, unknown>,
  userInfo: boolean,
): Record<string, SpanAttributeValue> {
  if (userInfo) {
    return spanData as Record<string, SpanAttributeValue>;
  }

  return Object.entries(spanData).reduce(
    (acc, [key, value]) => {
      if (!isNetworkPiiAttribute(key)) {
        if (key === MCP_TOOL_RESULT_ATTRIBUTE && typeof value === 'string') {
          const redactedResult = redactMcpResultUris(value);
          if (redactedResult !== undefined) {
            acc[key] = redactedResult;
          }
        } else {
          acc[key] = value as SpanAttributeValue;
        }
      }
      return acc;
    },
    {} as Record<string, SpanAttributeValue>,
  );
}

function redactMcpResultUris(serializedResult: string): string | undefined {
  try {
    return JSON.stringify(
      JSON.parse(serializedResult, (key, value) => {
        const normalizedKey = key.toLowerCase();
        return normalizedKey === 'uri' || normalizedKey.endsWith('_uri') ? undefined : value;
      }),
    );
  } catch {
    return undefined;
  }
}
