import { isObjectLike } from '../../utils/is';
import { captureError } from './errorCapture';
import { isMcpServerError } from './outcome';
import { getBoundedMcpString } from './serialization';
import type { MCPHandler, MCPServerInstance } from './types';

const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const LEGACY_URL_ELICITATION_REQUIRED_ERROR_CODE = -32042;

export type HandlerKind = 'tool' | 'resource' | 'prompt' | 'protocol';

export type HandlerState = {
  handlerKind: HandlerKind;
  handlerName: string;
};

type WrappedHandlerInfo = {
  originalHandler: MCPHandler;
  state: HandlerState;
};

type WrappedHandler = {
  handler: MCPHandler;
  state: HandlerState;
};

const wrappedHandlers = new WeakMap<MCPHandler, WrappedHandlerInfo>();
const handlersBeingRegistered = new WeakMap<MCPHandler, number>();

export function createWrappedHandler(originalHandler: MCPHandler, state: HandlerState): WrappedHandler {
  const existingInfo = wrappedHandlers.get(originalHandler);

  if (existingInfo && (existingInfo.state === state || handlersBeingRegistered.has(originalHandler))) {
    return { handler: originalHandler, state: existingInfo.state };
  }

  const unwrappedHandler = existingInfo?.originalHandler || originalHandler;
  const wrappedHandler = function (this: unknown, ...handlerArgs: unknown[]): unknown {
    return callErrorCapturingHandler.call(this, unwrappedHandler, state, handlerArgs);
  };

  wrappedHandlers.set(wrappedHandler, { originalHandler: unwrappedHandler, state });

  return { handler: wrappedHandler, state };
}

export function callWithHandlerRegistration<T>(handler: MCPHandler, register: () => T): T {
  handlersBeingRegistered.set(handler, (handlersBeingRegistered.get(handler) || 0) + 1);

  try {
    return register();
  } finally {
    const remainingRegistrations = (handlersBeingRegistered.get(handler) || 1) - 1;
    if (remainingRegistrations === 0) {
      handlersBeingRegistered.delete(handler);
    } else {
      handlersBeingRegistered.set(handler, remainingRegistrations);
    }
  }
}

function callErrorCapturingHandler(
  this: MCPServerInstance,
  originalHandler: MCPHandler,
  state: HandlerState,
  handlerArgs: unknown[],
): unknown {
  try {
    const result = originalHandler.apply(this, handlerArgs);

    if (isThenable(result)) {
      return Promise.resolve(result).catch(error => {
        captureHandlerErrorUnlessCancelled(error, state, handlerArgs);
        throw error;
      });
    }

    return result;
  } catch (error) {
    captureHandlerErrorUnlessCancelled(error, state, handlerArgs);
    throw error;
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!isObjectLike(value) && typeof value !== 'function') {
    return false;
  }

  return typeof (value as { then?: unknown }).then === 'function';
}

function captureHandlerErrorUnlessCancelled(error: unknown, state: HandlerState, handlerArgs: unknown[]): void {
  if (isCancellationError(error, handlerArgs) || isExpectedProtocolError(error, handlerArgs)) {
    return;
  }

  captureHandlerError(error, state, handlerArgs);
}

function isExpectedProtocolError(error: unknown, handlerArgs: unknown[]): boolean {
  const code = getProperty(error, 'code');
  if (typeof code !== 'number') {
    return false;
  }

  if (code === LEGACY_URL_ELICITATION_REQUIRED_ERROR_CODE) {
    return true;
  }

  return !isMcpServerError(
    { code, message: getStringProperty(error, 'message') || '' },
    getProtocolVersionFromHandlerArgs(handlerArgs),
  );
}

function getProtocolVersionFromHandlerArgs(handlerArgs: unknown[]): string | undefined {
  const request = handlerArgs[0];
  const params = getProperty(request, 'params');
  const requestMeta = getProperty(params, '_meta');
  const requestVersion = getStringProperty(requestMeta, MCP_PROTOCOL_VERSION_META_KEY);
  if (requestVersion) {
    return requestVersion;
  }

  const handlerContext = handlerArgs[handlerArgs.length - 1];
  const mcpRequest = getProperty(handlerContext, 'mcpReq');
  const envelope = getProperty(mcpRequest, 'envelope');
  const envelopeVersion = getStringProperty(envelope, MCP_PROTOCOL_VERSION_META_KEY);
  if (envelopeVersion) {
    return envelopeVersion;
  }

  const classification = getProperty(handlerArgs[1], 'classification');
  return getStringProperty(classification, 'revision');
}

function isCancellationError(error: unknown, handlerArgs: unknown[]): boolean {
  const signal = getHandlerAbortSignal(handlerArgs);
  if (!signal || getProperty(signal, 'aborted') !== true) {
    return false;
  }

  const signalReason = getProperty(signal, 'reason');
  if (signalReason !== undefined && error === signalReason) {
    return true;
  }

  const errorName = getStringProperty(error, 'name');
  const errorCode = getStringProperty(error, 'code');
  return (
    errorName === 'AbortError' ||
    errorName === 'CanceledError' ||
    errorName === 'CancelledError' ||
    errorCode === 'ABORT_ERR' ||
    errorCode === 'ERR_CANCELED' ||
    errorCode === 'ERR_CANCELLED'
  );
}

function getHandlerAbortSignal(handlerArgs: unknown[]): object | undefined {
  const handlerContext = handlerArgs[handlerArgs.length - 1];
  if (!isObjectLike(handlerContext)) {
    return undefined;
  }

  const mcpRequest = getProperty(handlerContext, 'mcpReq');
  const modernSignal = isObjectLike(mcpRequest) ? getProperty(mcpRequest, 'signal') : undefined;
  if (isObjectLike(modernSignal)) {
    return modernSignal;
  }

  const legacySignal = getProperty(handlerContext, 'signal');
  return isObjectLike(legacySignal) ? legacySignal : undefined;
}

function captureHandlerError(error: unknown, state: HandlerState, handlerArgs: unknown[]): void {
  try {
    const normalizedError = normalizeHandlerError(error);
    const handlerName = getBoundedMcpString(resolveHandlerName(state, handlerArgs));

    if (state.handlerKind === 'tool') {
      const errorName = getStringProperty(normalizedError, 'name') || '';
      const errorMessage = getStringProperty(normalizedError, 'message') || '';
      const errorData = { tool_name: handlerName };

      if (
        errorName === 'ProtocolValidationError' ||
        errorMessage.includes('validation') ||
        errorMessage.includes('protocol')
      ) {
        captureError(normalizedError, 'validation', errorData);
      } else if (
        errorName === 'ServerTimeoutError' ||
        errorMessage.includes('timed out') ||
        errorMessage.includes('timeout')
      ) {
        captureError(normalizedError, 'timeout', errorData);
      } else {
        captureError(normalizedError, 'tool_execution', errorData);
      }
    } else if (state.handlerKind === 'resource') {
      captureError(normalizedError, 'resource_execution', { resource_name: handlerName });
    } else if (state.handlerKind === 'prompt') {
      captureError(normalizedError, 'prompt_execution', { prompt_name: handlerName });
    } else {
      captureError(normalizedError, 'protocol', { method_name: handlerName });
    }
  } catch {
    // noop
  }
}

function resolveHandlerName(state: HandlerState, handlerArgs: unknown[]): string {
  if (state.handlerKind !== 'protocol' || state.handlerName !== 'unknown') {
    return state.handlerName;
  }

  return getStringProperty(handlerArgs[0], 'method') || state.handlerName;
}

function normalizeHandlerError(error: unknown): Error {
  try {
    if (error instanceof Error) {
      return error;
    }
  } catch {
    return new Error('Non-Error exception thrown by MCP handler');
  }

  if (typeof error === 'string') {
    return new Error(getBoundedMcpString(error));
  }
  if (error === null) {
    return new Error('null');
  }
  if (error === undefined) {
    return new Error('undefined');
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return new Error(`${error}`);
  }

  return new Error('Non-Error exception thrown by MCP handler');
}

function getStringProperty(value: unknown, key: string): string | undefined {
  const property = getProperty(value, key);
  return typeof property === 'string' ? property : undefined;
}

function getProperty(value: unknown, key: string): unknown {
  if (!isObjectLike(value)) {
    return undefined;
  }

  try {
    return value[key];
  } catch {
    return undefined;
  }
}
