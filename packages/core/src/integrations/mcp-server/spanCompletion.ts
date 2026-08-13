import { SPAN_STATUS_ERROR } from '../../tracing';
import {
  ERROR_TYPE_ATTRIBUTE,
  MCP_PROTOCOL_VERSION_ATTRIBUTE,
  MCP_REQUEST_OUTCOME_ATTRIBUTE,
  RPC_RESPONSE_STATUS_CODE_ATTRIBUTE,
} from './attributes';
import {
  deleteSpanForOutgoingRequest,
  deleteSpanForResponseSend,
  finishSpan,
  takePendingSpansForTransport,
  takeSpanForCancelledRequest,
  takeSpanForOutgoingRequest,
  takeSpanForOutgoingResponse,
  takeSpanForRequest,
} from './correlation';
import { getJsonRpcErrorAttributes, isMcpServerError } from './outcome';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import {
  extractCommonResultAttributes,
  extractPromptResultAttributes,
  extractToolResultAttributes,
} from './resultExtraction';
import { getBoundedMcpString } from './serialization';
import {
  buildServerAttributesFromInfo,
  extractSessionDataFromInitializeResponse,
  extractSessionDataFromResponse,
} from './sessionExtraction';
import { updateSessionDataForTransport } from './sessionManagement';
import type { JsonRpcError, MCPTransport, RequestId, RequestSpanMapValue, ResolvedMcpOptions } from './types';

export function completeSpanWithResults(
  transport: MCPTransport,
  requestId: RequestId,
  result: unknown,
  options: ResolvedMcpOptions,
  error?: JsonRpcError,
): void {
  const spanData = takeSpanForRequest(transport, requestId);
  if (spanData) {
    completeTakenSpanWithResults(transport, spanData, result, options, error);
  }
}

export function completeTakenSpanWithResults(
  transport: MCPTransport,
  spanData: RequestSpanMapValue,
  result: unknown,
  options: ResolvedMcpOptions,
  error?: JsonRpcError,
): void {
  deleteSpanForResponseSend(transport, spanData);
  if (spanData.finished) {
    return;
  }

  const { span, method, protocolVersion } = spanData;
  const responseSessionData =
    method === 'initialize' ? extractSessionDataFromInitializeResponse(result) : extractSessionDataFromResponse(result);
  if (method === 'initialize' && (responseSessionData.protocolVersion || responseSessionData.serverInfo)) {
    updateSessionDataForTransport(transport, responseSessionData);
  }
  const responseAttributes: Record<string, string | number> = {
    ...buildServerAttributesFromInfo(responseSessionData.serverInfo),
  };
  if (responseSessionData.protocolVersion) {
    responseAttributes[MCP_PROTOCOL_VERSION_ATTRIBUTE] = responseSessionData.protocolVersion;
  }
  if (Object.keys(responseAttributes).length > 0) {
    span.setAttributes(responseAttributes);
  }

  if (error) {
    span.setAttributes(getJsonRpcErrorAttributes(error, protocolVersion));
    if (isMcpServerError(error, protocolVersion)) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: getBoundedMcpString(error.message, 256) });
    }
  } else {
    const resultAttributes = extractCommonResultAttributes(method, result);
    if (method === 'tools/call') {
      Object.assign(resultAttributes, extractToolResultAttributes(result, options.recordOutputs));
    } else if (method === 'prompts/get') {
      Object.assign(resultAttributes, extractPromptResultAttributes(result, options.recordOutputs));
    }
    if (Object.keys(resultAttributes).length > 0) {
      span.setAttributes(filterMcpPiiFromSpanData(resultAttributes, spanData.includeUserInfo));
    }
    if (resultAttributes[ERROR_TYPE_ATTRIBUTE] === 'tool_error') {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'tool_error' });
    }
  }

  finishSpan(spanData, currentSpan => currentSpan.end());
}

export function cancelSpanForRequest(transport: MCPTransport, requestId: RequestId): void {
  cancelSpan(takeSpanForCancelledRequest(transport, requestId));
}

export function failSpanForResponseSend(transport: MCPTransport, spanData: RequestSpanMapValue, error: unknown): void {
  deleteSpanForResponseSend(transport, spanData);
  failSpan(spanData, error, 'send_error');
}

export function completeSpanForOutgoingResponse(
  transport: MCPTransport,
  requestId: RequestId,
  result: unknown,
  error?: JsonRpcError,
): void {
  const spanData = takeSpanForOutgoingResponse(transport, requestId);
  if (!spanData) {
    return;
  }

  completeTakenSpanForOutgoingResponse(transport, spanData, result, error);
}

export function completeTakenSpanForOutgoingResponse(
  transport: MCPTransport,
  spanData: RequestSpanMapValue,
  result: unknown,
  error?: JsonRpcError,
): void {
  deleteSpanForOutgoingRequest(transport, spanData);
  finishSpan(spanData, span => {
    if (error) {
      span.setAttributes({
        [ERROR_TYPE_ATTRIBUTE]: String(error.code),
        [RPC_RESPONSE_STATUS_CODE_ATTRIBUTE]: String(error.code),
      });
      span.setStatus({ code: SPAN_STATUS_ERROR, message: getBoundedMcpString(error.message, 256) });
    } else {
      const resultAttributes = extractCommonResultAttributes(spanData.method, result);
      if (Object.keys(resultAttributes).length > 0) {
        span.setAttributes(filterMcpPiiFromSpanData(resultAttributes, spanData.includeUserInfo));
      }
    }
    span.end();
  });
}

export function failSpanForOutgoingRequest(
  transport: MCPTransport,
  requestId: RequestId,
  error: unknown,
  outcome: 'send_error' | 'response_error',
): void {
  const spanData = takeSpanForOutgoingRequest(transport, requestId);
  if (spanData) {
    failTakenSpanForOutgoingRequest(transport, spanData, error, outcome);
  }
}

export function failTakenSpanForOutgoingRequest(
  transport: MCPTransport,
  spanData: RequestSpanMapValue,
  error: unknown,
  outcome: 'send_error' | 'response_error',
): void {
  deleteSpanForOutgoingRequest(transport, spanData);
  failSpan(spanData, error, outcome);
}

export function cancelTakenSpanForOutgoingRequest(transport: MCPTransport, spanData: RequestSpanMapValue): void {
  deleteSpanForOutgoingRequest(transport, spanData);
  cancelSpan(spanData);
}

export function cleanupPendingSpansForTransport(transport: MCPTransport): void {
  for (const spanData of takePendingSpansForTransport(transport)) {
    cancelSpan(spanData);
  }
}

function cancelSpan(spanData?: RequestSpanMapValue): void {
  if (!spanData) {
    return;
  }
  finishSpan(spanData, span => {
    span.setAttributes({ [MCP_REQUEST_OUTCOME_ATTRIBUTE]: 'cancelled' });
    span.end();
  });
}

function failSpan(
  spanData: RequestSpanMapValue | undefined,
  error: unknown,
  outcome: 'send_error' | 'response_error',
): void {
  if (!spanData) {
    return;
  }
  finishSpan(spanData, span => {
    span.setAttributes({
      [ERROR_TYPE_ATTRIBUTE]: getErrorType(error),
      [MCP_REQUEST_OUTCOME_ATTRIBUTE]: outcome,
    });
    span.setStatus({
      code: SPAN_STATUS_ERROR,
      message: outcome === 'send_error' ? 'transport_send_error' : 'response_processing_error',
    });
    span.end();
  });
}

function getErrorType(error: unknown): string {
  try {
    if (error && typeof error === 'object') {
      const name = (error as { name?: unknown }).name;
      if (typeof name === 'string' && name) {
        return name;
      }
      const constructorName = (error as { constructor?: { name?: unknown } }).constructor?.name;
      if (typeof constructorName === 'string' && constructorName) {
        return constructorName;
      }
    }
  } catch {
    // Ignore hostile error objects and fall back to their primitive type.
  }
  return typeof error;
}
