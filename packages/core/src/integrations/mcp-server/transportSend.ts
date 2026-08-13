import { withActiveSpan } from '../../tracing';
import { MAX_BAGGAGE_STRING_LENGTH, mergeBaggageHeaders } from '../../utils/baggage';
import { chainAndCopyPromiseLike } from '../../utils/chain-and-copy-promiselike';
import { isPlainObject, isThenable } from '../../utils/is';
import { fill } from '../../utils/object';
import { getActiveSpan } from '../../utils/spanUtils';
import { getTraceData } from '../../utils/traceData';
import {
  getSpanForOutgoingRequest,
  getSpanForRequest,
  storeSpanForOutgoingRequest,
  takeSpanForResponseSend,
} from './correlation';
import { getSessionDataForTransport } from './sessionManagement';
import {
  cancelTakenSpanForOutgoingRequest,
  completeTakenSpanWithResults,
  failSpanForResponseSend,
  failTakenSpanForOutgoingRequest,
} from './spanCompletion';
import { createMcpOutgoingNotificationSpan, createMcpOutgoingRequestSpan } from './spans';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  MCPTransport,
  RequestSpanMapValue,
  ResolvedMcpOptions,
} from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './validation';

const MAX_TRACEPARENT_LENGTH = 512;
const MAX_TRACESTATE_LENGTH = 512;

/** Wraps transport.send to trace outgoing messages and correlate terminal responses. */
export function wrapTransportSend(transport: MCPTransport, options: ResolvedMcpOptions): void {
  if (!transport.send) {
    return;
  }

  fill(transport, 'send', originalSend => {
    return function (this: MCPTransport, ...args: unknown[]) {
      const [message] = args;

      if (isJsonRpcNotification(message)) {
        return sendNotification(transport, originalSend, this, message, args.slice(1), options);
      }
      if (isJsonRpcRequest(message)) {
        return sendRequest(transport, originalSend, this, message, args.slice(1), options);
      }
      if (isJsonRpcResponse(message) && message.id != null) {
        const spanData = takeSpanForResponseSend(transport, message.id);
        if (spanData) {
          return sendResponse(transport, originalSend, this, args, message.result, message.error, spanData, options);
        }
      }

      return (originalSend as (...sendArgs: unknown[]) => unknown).call(this, ...args);
    };
  });
}

function sendNotification(
  transport: MCPTransport,
  originalSend: unknown,
  receiver: MCPTransport,
  message: JsonRpcNotification,
  trailingArgs: unknown[],
  options: ResolvedMcpOptions,
): unknown {
  const cancelledRequestId =
    message.method === 'notifications/cancelled' ? getRequestId(message.params?.requestId) : undefined;
  const cancelledSpanData =
    cancelledRequestId !== undefined ? getSpanForOutgoingRequest(transport, cancelledRequestId) : undefined;
  const relatedSpanData = cancelledSpanData ?? getRelatedRequestSpan(transport, trailingArgs[0]);
  const sendResult = createMcpOutgoingNotificationSpan(
    message,
    transport,
    options,
    () => {
      const outgoingMessage = injectMcpTraceContext(message, relatedSpanData);
      return (originalSend as (...sendArgs: unknown[]) => unknown).call(receiver, outgoingMessage, ...trailingArgs);
    },
    relatedSpanData?.sessionData,
    relatedSpanData?.span,
  );
  if (cancelledRequestId === undefined) {
    return sendResult;
  }
  if (isThenable(sendResult)) {
    return chainAndCopyPromiseLike(
      sendResult as PromiseLike<unknown> & Record<string, unknown>,
      () => {
        if (cancelledSpanData) {
          cancelTakenSpanForOutgoingRequest(transport, cancelledSpanData);
        }
      },
      () => {},
    );
  }

  if (cancelledSpanData) {
    cancelTakenSpanForOutgoingRequest(transport, cancelledSpanData);
  }
  return sendResult;
}

function sendRequest(
  transport: MCPTransport,
  originalSend: unknown,
  receiver: MCPTransport,
  message: JsonRpcRequest,
  trailingArgs: unknown[],
  options: ResolvedMcpOptions,
): unknown {
  const relatedSpanData = getRelatedRequestSpan(transport, trailingArgs[0]);
  const sessionData = relatedSpanData?.sessionData ?? getSessionDataForTransport(transport);
  const span = createMcpOutgoingRequestSpan(
    message,
    transport,
    options,
    sessionData,
    relatedSpanData?.span ?? getActiveSpan(),
  );
  const spanData = storeSpanForOutgoingRequest(
    transport,
    message.id,
    span,
    message.method,
    sessionData,
    relatedSpanData,
  );

  let sendResult: unknown;
  try {
    sendResult = withActiveSpan(span, () => {
      const outgoingMessage = injectMcpTraceContext(message, relatedSpanData);
      return (originalSend as (...sendArgs: unknown[]) => unknown).call(receiver, outgoingMessage, ...trailingArgs);
    });
  } catch (error) {
    failTakenSpanForOutgoingRequest(transport, spanData, error, 'send_error');
    throw error;
  }

  return isThenable(sendResult)
    ? chainAndCopyPromiseLike(
        sendResult as PromiseLike<unknown> & Record<string, unknown>,
        () => {},
        error => failTakenSpanForOutgoingRequest(transport, spanData, error, 'send_error'),
      )
    : sendResult;
}

function sendResponse(
  transport: MCPTransport,
  originalSend: unknown,
  receiver: MCPTransport,
  args: unknown[],
  result: unknown,
  error: Parameters<typeof completeTakenSpanWithResults>[4],
  spanData: RequestSpanMapValue,
  options: ResolvedMcpOptions,
): unknown {
  let sendResult: unknown;
  try {
    sendResult = (originalSend as (...sendArgs: unknown[]) => unknown).call(receiver, ...args);
  } catch (sendError) {
    failSpanForResponseSend(transport, spanData, sendError);
    throw sendError;
  }

  if (isThenable(sendResult)) {
    return chainAndCopyPromiseLike(
      sendResult as PromiseLike<unknown> & Record<string, unknown>,
      () => completeTakenSpanWithResults(transport, spanData, result, options, error),
      sendError => failSpanForResponseSend(transport, spanData, sendError),
    );
  }

  completeTakenSpanWithResults(transport, spanData, result, options, error);
  return sendResult;
}

function getRequestId(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function getRelatedRequestSpan(transport: MCPTransport, sendOptions: unknown): RequestSpanMapValue | undefined {
  if (!isPlainObject(sendOptions)) {
    return undefined;
  }
  const relatedRequestId = sendOptions.relatedRequestId;
  return typeof relatedRequestId === 'string' || typeof relatedRequestId === 'number'
    ? getSpanForRequest(transport, relatedRequestId)
    : undefined;
}

function injectMcpTraceContext<T extends JsonRpcNotification | JsonRpcRequest>(
  message: T,
  relatedSpanData?: RequestSpanMapValue,
): T {
  if (message.params !== undefined && !isPlainObject(message.params)) {
    return message;
  }

  const params = message.params ?? {};
  const meta = isPlainObject(params._meta) ? params._meta : {};
  const hadPropagationFields =
    meta.traceparent !== undefined || meta.tracestate !== undefined || meta.baggage !== undefined;
  const customMeta = { ...meta };
  delete customMeta.traceparent;
  delete customMeta.tracestate;
  delete customMeta.baggage;
  const traceData = getMcpTraceData();
  const existingBaggage =
    getValidPropagationField(meta.baggage, MAX_BAGGAGE_STRING_LENGTH) ??
    getValidPropagationField(relatedSpanData?.baggage, MAX_BAGGAGE_STRING_LENGTH);
  const currentBaggage = getValidPropagationField(traceData.baggage, MAX_BAGGAGE_STRING_LENGTH);
  const baggage =
    currentBaggage && existingBaggage
      ? mergeBaggageHeaders(existingBaggage, currentBaggage)
      : (existingBaggage ?? currentBaggage);
  const traceparent = getValidPropagationField(traceData.traceparent, MAX_TRACEPARENT_LENGTH);
  const tracestate =
    getValidPropagationField(meta.tracestate, MAX_TRACESTATE_LENGTH) ??
    getValidPropagationField(relatedSpanData?.tracestate, MAX_TRACESTATE_LENGTH);

  if (!traceparent && !tracestate && !baggage && !hadPropagationFields) {
    return message;
  }

  return {
    ...message,
    params: {
      ...params,
      _meta: {
        ...customMeta,
        ...(traceparent ? { traceparent } : {}),
        ...(tracestate ? { tracestate } : {}),
        ...(baggage ? { baggage } : {}),
      },
    },
  };
}

function getValidPropagationField(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function getMcpTraceData(): ReturnType<typeof getTraceData> {
  try {
    return getTraceData({ propagateTraceparent: true });
  } catch {
    return {};
  }
}
