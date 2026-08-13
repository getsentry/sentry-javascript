import { ERROR_TYPE_ATTRIBUTE, RPC_RESPONSE_STATUS_CODE_ATTRIBUTE } from './attributes';
import type { JsonRpcError, McpAttributes } from './types';

const JSON_RPC_CALLER_ERROR_CODES = new Set([-32700, -32600, -32601, -32602]);
const LEGACY_RESOURCE_NOT_FOUND_ERROR_CODE = -32002;
const MODERN_CALLER_ERROR_CODES = new Set([-32020, -32021, -32022]);
const STATELESS_MCP_PROTOCOL_VERSION = '2026-07-28';

function isStatelessMcpProtocolVersion(protocolVersion?: string): boolean {
  return (
    typeof protocolVersion === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(protocolVersion) &&
    protocolVersion >= STATELESS_MCP_PROTOCOL_VERSION
  );
}

/** Whether a JSON-RPC response represents a server-side operation failure. */
export function isMcpServerError(error: JsonRpcError, protocolVersion?: string): boolean {
  if (JSON_RPC_CALLER_ERROR_CODES.has(error.code)) {
    return false;
  }

  if (isStatelessMcpProtocolVersion(protocolVersion)) {
    return !MODERN_CALLER_ERROR_CODES.has(error.code);
  }

  return error.code !== LEGACY_RESOURCE_NOT_FOUND_ERROR_CODE;
}

/** Builds OTel JSON-RPC outcome attributes for an MCP server span. */
export function getJsonRpcErrorAttributes(error: JsonRpcError, protocolVersion?: string): McpAttributes {
  return {
    [RPC_RESPONSE_STATUS_CODE_ATTRIBUTE]: String(error.code),
    ...(isMcpServerError(error, protocolVersion) ? { [ERROR_TYPE_ATTRIBUTE]: String(error.code) } : {}),
  };
}
