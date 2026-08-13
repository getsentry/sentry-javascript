import { isObjectLike } from '../../utils/is';
import { fill } from '../../utils/object';
import { callWithHandlerRegistration, createWrappedHandler } from './handlerErrorCapture';
import type { MCPHandler, MCPServerInstance } from './types';

const wrappedRequestHandlerServers = new WeakSet<object>();

export function wrapRequestHandlers(serverInstance: MCPServerInstance): void {
  if (wrappedRequestHandlerServers.has(serverInstance)) {
    return;
  }

  wrappedRequestHandlerServers.add(serverInstance);
  wrapExistingRequestHandlers(serverInstance);

  if (typeof serverInstance.setRequestHandler !== 'function') {
    return;
  }

  fill(serverInstance, 'setRequestHandler', originalSetRequestHandler => {
    return function (this: MCPServerInstance, methodOrSchema: unknown, ...args: unknown[]): unknown {
      const handler = args[args.length - 1];
      if (typeof handler !== 'function') {
        return (originalSetRequestHandler as (...requestHandlerArgs: unknown[]) => unknown).call(
          this,
          methodOrSchema,
          ...args,
        );
      }

      const wrapped = createWrappedHandler(handler as MCPHandler, {
        handlerKind: 'protocol',
        handlerName: getRequestHandlerName(methodOrSchema),
      });

      return callWithHandlerRegistration(wrapped.handler, () =>
        (originalSetRequestHandler as (...requestHandlerArgs: unknown[]) => unknown).call(
          this,
          methodOrSchema,
          ...args.slice(0, -1),
          wrapped.handler,
        ),
      );
    };
  });
}

function wrapExistingRequestHandlers(serverInstance: MCPServerInstance): void {
  // Both SDK generations store their fully composed low-level handlers in this map.
  const requestHandlers = getProperty(serverInstance, '_requestHandlers');
  if (!(requestHandlers instanceof Map)) {
    return;
  }

  for (const [method, handler] of requestHandlers.entries()) {
    if (typeof method !== 'string' || typeof handler !== 'function') {
      continue;
    }

    try {
      requestHandlers.set(
        method,
        createWrappedHandler(handler as MCPHandler, { handlerKind: 'protocol', handlerName: method }).handler,
      );
    } catch {
      // noop
    }
  }
}

function getRequestHandlerName(methodOrSchema: unknown): string {
  if (typeof methodOrSchema === 'string') {
    return methodOrSchema;
  }

  const shape = getProperty(methodOrSchema, 'shape');
  const methodSchema = getProperty(shape, 'method');
  const literalValue = getProperty(methodSchema, 'value');
  if (typeof literalValue === 'string') {
    return literalValue;
  }

  const definition = getProperty(methodSchema, '_def');
  const definitionValue = getProperty(definition, 'value');
  return typeof definitionValue === 'string' ? definitionValue : 'unknown';
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
