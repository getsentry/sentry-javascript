import { stringify } from '../../utils/string';

const MAX_MCP_ATTRIBUTE_LENGTH = 10_000;
const MAX_MCP_METADATA_STRING_LENGTH = 256;
const MAX_MCP_ATTRIBUTE_LIST_LENGTH = 32;

function truncateMcpString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return maxLength <= 3 ? value.slice(0, maxLength) : `${value.slice(0, maxLength - 3)}...`;
}

/** Bounds an untrusted MCP metadata value before adding it to a span. */
export function getBoundedMcpString(value: string, maxLength: number = MAX_MCP_METADATA_STRING_LENGTH): string {
  return truncateMcpString(value, maxLength);
}

/** Bounds an untrusted MCP metadata list before adding it to a span. */
export function getBoundedMcpStringList(
  values: unknown[],
  maxItems: number = MAX_MCP_ATTRIBUTE_LIST_LENGTH,
  maxStringLength: number = MAX_MCP_METADATA_STRING_LENGTH,
): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .slice(0, maxItems)
    .map(value => getBoundedMcpString(value, maxStringLength));
}

/** Serializes untrusted MCP content into a bounded span attribute value. */
export function serializeMcpValue(value: unknown): string | undefined {
  const serialized = stringify(value, '{"_sentry":{"unserializable":true}}');
  if (serialized === undefined) {
    return undefined;
  }
  if (serialized.length <= MAX_MCP_ATTRIBUTE_LENGTH) {
    return serialized;
  }

  if (typeof value === 'string') {
    return truncateMcpString(serialized, MAX_MCP_ATTRIBUTE_LENGTH);
  }

  // Slicing serialized JSON would produce an invalid value for OTel's object-valued GenAI attributes.
  return JSON.stringify({ _sentry: { truncated: true, originalLength: serialized.length } });
}

/** Preserves the historical MCP attributes' JSON encoding, including quoted strings. */
export function serializeLegacyMcpValue(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : truncateMcpString(serialized, MAX_MCP_ATTRIBUTE_LENGTH);
  } catch {
    return '[unserializable]';
  }
}
