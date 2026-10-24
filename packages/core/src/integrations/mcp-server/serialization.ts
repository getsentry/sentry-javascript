import { stringify } from '../../utils/string';

// Bound the additional content emitted alongside legacy attributes during migration.
export const MAX_MCP_CONTENT_LENGTH = 20_000;

/**
 * Serialize opt-in MCP content without emitting partial JSON or interrupting dispatch.
 * @param value - Content selected from the MCP request or result
 * @returns JSON within the capture limit, or undefined when unavailable
 */
export function serializeMcpContent(value: unknown): string | undefined {
  const serialized = stringify(value, '');
  return serialized && serialized.length <= MAX_MCP_CONTENT_LENGTH ? serialized : undefined;
}
