import { isObjectLike } from '../../utils/is';
import { fill } from '../../utils/object';
import {
  callWithHandlerRegistration,
  createWrappedHandler,
  type HandlerKind,
  type HandlerState,
} from './handlerErrorCapture';
import type { MCPHandler, MCPServerInstance } from './types';

type RegisteredHandlerMethod = 'tool' | 'resource' | 'prompt' | 'registerTool' | 'registerResource' | 'registerPrompt';
type ExecutionProperty = 'executor' | 'readCallback' | 'handler' | 'callback';

type RegistrationHandleState = HandlerState & {
  callbackPipelineInstrumented: boolean;
  executionProperty: ExecutionProperty;
};

const wrappedRegistrationHandles = new WeakMap<object, RegistrationHandleState>();

export function wrapRegistrationMethod(serverInstance: MCPServerInstance, methodName: RegisteredHandlerMethod): void {
  fill(serverInstance, methodName, originalMethod => {
    return function (this: MCPServerInstance, name: string, ...args: unknown[]) {
      const handler = args[args.length - 1];
      if (typeof handler !== 'function') {
        return (originalMethod as (...methodArgs: unknown[]) => unknown).call(this, name, ...args);
      }

      const state: RegistrationHandleState = {
        callbackPipelineInstrumented: true,
        executionProperty: getDefaultExecutionProperty(getHandlerKind(methodName)),
        handlerKind: getHandlerKind(methodName),
        handlerName: name,
      };
      const wrapped = createWrappedHandler(handler as MCPHandler, state);
      const registrationHandle = callWithHandlerRegistration(wrapped.handler, () =>
        (originalMethod as (...methodArgs: unknown[]) => unknown).call(
          this,
          name,
          ...args.slice(0, -1),
          wrapped.handler,
        ),
      );
      const effectiveState = wrapped.state as RegistrationHandleState;

      effectiveState.executionProperty = getExecutionProperty(registrationHandle, effectiveState.handlerKind);
      wrapRegistrationHandle(registrationHandle, effectiveState);

      return registrationHandle;
    };
  });
}

/**
 * SDK 1.x and 2.x keep high-level registrations in private maps and read their callable
 * properties at dispatch time. The property names differ by version, so discovery is based
 * on each registration's runtime shape instead of assuming the currently installed SDK.
 */
export function wrapExistingHandlers(serverInstance: MCPServerInstance): void {
  const server = serverInstance as unknown as Record<string, unknown>;

  wrapExistingRegistry(server, '_registeredTools', 'tool', (name, _registration) => name);
  wrapExistingRegistry(server, '_registeredResources', 'resource', (_key, registration) => {
    return getStringProperty(registration, 'name') || 'unknown';
  });
  wrapExistingRegistry(server, '_registeredResourceTemplates', 'resource', name => name);
  wrapExistingRegistry(server, '_registeredPrompts', 'prompt', name => name);
}

function wrapExistingRegistry(
  server: Record<string, unknown>,
  registryProperty: string,
  handlerKind: Exclude<HandlerKind, 'protocol'>,
  getHandlerName: (key: string, registration: Record<string, unknown>) => string,
): void {
  const registry = getProperty(server, registryProperty);
  if (!isObjectLike(registry)) {
    return;
  }

  let registrations: Array<[string, Record<string, unknown>]>;
  try {
    registrations = Object.entries(registry as Record<string, Record<string, unknown>>);
  } catch {
    return;
  }

  for (const [key, registration] of registrations) {
    if (!isObjectLike(registration) || wrappedRegistrationHandles.has(registration)) {
      continue;
    }

    const executionProperty = getExecutionProperty(registration, handlerKind);
    if (typeof getProperty(registration, executionProperty) !== 'function') {
      continue;
    }

    const state: RegistrationHandleState = {
      callbackPipelineInstrumented: false,
      executionProperty,
      handlerKind,
      handlerName: getHandlerName(key, registration),
    };
    wrapExecutionProperty(registration, state);
    wrapRegistrationHandle(registration, state);
  }
}

function wrapRegistrationHandle(registrationHandle: unknown, state: RegistrationHandleState): void {
  if (!isObjectLike(registrationHandle) || typeof getProperty(registrationHandle, 'update') !== 'function') {
    return;
  }

  const handle = registrationHandle as Record<string, unknown>;
  const existingState = wrappedRegistrationHandles.get(handle);
  if (existingState) {
    if (state.callbackPipelineInstrumented) {
      existingState.callbackPipelineInstrumented = true;
    }
    return;
  }

  fill(handle, 'update', originalUpdate => {
    return function (this: unknown, updates: unknown, ...args: unknown[]): unknown {
      const updateObject = isObjectLike(updates) ? (updates as Record<string, unknown>) : undefined;
      const updatedName = getStringProperty(updateObject, 'name') || state.handlerName;
      const callback = getProperty(updateObject, 'callback');
      const forwardedUpdates =
        typeof callback === 'function'
          ? { ...(updateObject || {}), callback: createWrappedHandler(callback as MCPHandler, state).handler }
          : updates;
      const executionHandlerBeforeUpdate = getProperty(handle, state.executionProperty);
      const result = (originalUpdate as (...updateArgs: unknown[]) => unknown).call(this, forwardedUpdates, ...args);

      state.handlerName = updatedName;

      if (typeof callback === 'function') {
        state.callbackPipelineInstrumented = true;
      } else if (
        !state.callbackPipelineInstrumented &&
        typeof getProperty(handle, state.executionProperty) === 'function' &&
        getProperty(handle, state.executionProperty) !== executionHandlerBeforeUpdate
      ) {
        wrapExecutionProperty(handle, state);
      }

      return result;
    };
  });

  wrappedRegistrationHandles.set(handle, state);
}

function wrapExecutionProperty(registrationHandle: Record<string, unknown>, state: RegistrationHandleState): void {
  const executionHandler = getProperty(registrationHandle, state.executionProperty);
  if (typeof executionHandler !== 'function') {
    return;
  }

  try {
    registrationHandle[state.executionProperty] = createWrappedHandler(executionHandler as MCPHandler, state).handler;
  } catch {
    // noop
  }
}

function getExecutionProperty(registrationHandle: unknown, handlerKind: HandlerKind): ExecutionProperty {
  if (handlerKind === 'tool') {
    return hasFunctionProperty(registrationHandle, 'executor') ? 'executor' : 'handler';
  }
  if (handlerKind === 'resource') {
    return 'readCallback';
  }
  if (handlerKind === 'prompt') {
    return hasFunctionProperty(registrationHandle, 'handler') ? 'handler' : 'callback';
  }
  return 'handler';
}

function getDefaultExecutionProperty(handlerKind: HandlerKind): ExecutionProperty {
  if (handlerKind === 'tool') {
    return 'executor';
  }
  if (handlerKind === 'resource') {
    return 'readCallback';
  }
  return 'handler';
}

function getHandlerKind(methodName: RegisteredHandlerMethod): Exclude<HandlerKind, 'protocol'> {
  if (methodName === 'tool' || methodName === 'registerTool') {
    return 'tool';
  }
  if (methodName === 'resource' || methodName === 'registerResource') {
    return 'resource';
  }
  return 'prompt';
}

function hasFunctionProperty(value: unknown, key: string): boolean {
  return typeof getProperty(value, key) === 'function';
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
