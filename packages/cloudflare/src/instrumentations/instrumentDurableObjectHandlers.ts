/* eslint-disable @typescript-eslint/unbound-method */
import { FUNCTION, WEBSOCKET } from '@sentry/conventions/op';
import { captureException, debug } from '@sentry/core';
import type { DurableObject } from 'cloudflare:workers';
import type { CloudflareOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { ensureInstrumented } from '../instrument';
import { init } from '../sdk';
import { wrapMethodWithSentry } from '../wrapMethodWithSentry';
import { wrapRequestHandlerWithInit } from '../wrapRequestHandlerWithInit';

/**
 * The instrumented context of the Durable Object being wrapped.
 *
 * Kept as `any` for the same reason as in `durableobject.ts`: a concrete `DurableObjectState` here
 * makes `tsc` relate its `SqlStorage` graph against the parameter union of `wrapMethodWithSentry`,
 * which hangs the type build.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InstrumentedDurableObjectContext = any;

/**
 * Instruments the built-in Durable Object handler methods on a constructed instance.
 *
 * These are the methods that are available on a Durable Object
 * ref: https://developers.cloudflare.com/durable-objects/api/base/
 * - obj.alarm
 * - obj.fetch
 * - obj.webSocketError
 * - obj.webSocketClose
 * - obj.webSocketMessage
 *
 * Any other public methods on the Durable Object instance are RPC calls.
 *
 * @internal
 */
export function instrumentDurableObjectHandlers<E, T extends DurableObject<E>>(
  obj: T,
  options: CloudflareOptions,
  context: InstrumentedDurableObjectContext,
): void {
  // Bind each built-in handler to this instance before wrapping.
  // See https://github.com/getsentry/sentry-javascript/issues/22328
  if (obj.fetch && typeof obj.fetch === 'function') {
    setInstanceHandler(
      obj,
      'fetch',
      ensureInstrumented(
        obj.fetch.bind(obj),
        original =>
          new Proxy(original, {
            apply(target, thisArg, args) {
              return wrapRequestHandlerWithInit(
                { options, request: args[0], context },
                () => {
                  return Reflect.apply(target, thisArg, args);
                },
                init,
              );
            },
          }),
      ),
    );
  }

  if (obj.alarm && typeof obj.alarm === 'function') {
    // Alarms are independent invocations, so we start a new trace and link to the previous alarm
    setInstanceHandler(
      obj,
      'alarm',
      wrapMethodWithSentry(
        {
          options,
          context,
          spanName: 'alarm',
          spanOp: FUNCTION,
          startNewTrace: true,
          origin: 'auto.faas.cloudflare.durable_object',
        },
        obj.alarm.bind(obj),
      ),
    );
  }

  if (obj.webSocketMessage && typeof obj.webSocketMessage === 'function') {
    setInstanceHandler(
      obj,
      'webSocketMessage',
      wrapMethodWithSentry(
        {
          options,
          context,
          spanName: 'webSocketMessage',
          spanOp: WEBSOCKET,
          origin: 'auto.faas.cloudflare.durable_object',
        },
        obj.webSocketMessage.bind(obj),
      ),
    );
  }

  if (obj.webSocketClose && typeof obj.webSocketClose === 'function') {
    setInstanceHandler(
      obj,
      'webSocketClose',
      wrapMethodWithSentry(
        {
          options,
          context,
          spanName: 'webSocketClose',
          spanOp: WEBSOCKET,
          origin: 'auto.faas.cloudflare.durable_object',
        },
        obj.webSocketClose.bind(obj),
      ),
    );
  }

  if (obj.webSocketError && typeof obj.webSocketError === 'function') {
    setInstanceHandler(
      obj,
      'webSocketError',
      wrapMethodWithSentry(
        {
          options,
          context,
          spanName: 'webSocketError',
          spanOp: WEBSOCKET,
          origin: 'auto.faas.cloudflare.durable_object',
        },
        obj.webSocketError.bind(obj),
        (_, error) =>
          captureException(error, {
            mechanism: {
              type: 'auto.faas.cloudflare.durable_object_websocket',
              handled: false,
            },
          }),
      ),
    );
  }
}

/**
 * Installs an instrumented handler as an own property of the Durable Object instance.
 *
 * A plain assignment is not always possible. The `agents` package installs its handlers with
 * `Object.defineProperty(instance, name, { value, configurable: true })`, and `defineProperty`
 * leaves `writable` at `false`. Assigning to such a property throws a `TypeError` in strict mode,
 * so a read-only property is redefined instead. When the property can be neither assigned nor
 * redefined, the handler stays uninstrumented rather than breaking the object.
 */
function setInstanceHandler(obj: object, name: string, handler: unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(obj, name);

  try {
    if (descriptor?.writable === false) {
      Object.defineProperty(obj, name, {
        value: handler,
        writable: true,
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
      });
    } else {
      (obj as Record<string, unknown>)[name] = handler;
    }
  } catch (error) {
    DEBUG_BUILD && debug.warn(`Failed to instrument Durable Object handler "${name}"`, error);
  }
}
