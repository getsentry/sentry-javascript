import {
  addNonEnumerableProperty,
  getClient,
  handleCallbackErrors,
  hasSpanStreamingEnabled,
  objectify,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';
import { startSpan } from '@sentry/core/browser';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  CODE_FUNCTION_NAME,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
  URL_PATH,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { captureException } from '@sentry/svelte';
import type { LoadEvent } from '@sveltejs/kit';
import type { SentryWrappedFlag } from '../common/utils';
import { getRouteId, isHttpError, isRedirect } from '../common/utils';

type PatchedLoadEvent = LoadEvent & Partial<SentryWrappedFlag>;

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // We don't want to capture thrown `Redirect`s as these are not errors but expected behaviour
  // Neither 4xx errors, given that they are not valuable.
  if (
    isRedirect(objectifiedErr) ||
    (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400)
  ) {
    return objectifiedErr;
  }

  captureException(objectifiedErr, {
    mechanism: {
      type: 'auto.function.sveltekit.load',
      handled: false,
    },
  });

  return objectifiedErr;
}

/**
 * Wrap load function with Sentry. This wrapper will
 *
 * - catch errors happening during the execution of `load`
 * - create a load span if performance monitoring is enabled
 * - attach tracing Http headers to `fetch` requests if performance monitoring is enabled to get connected traces.
 * - add a fetch breadcrumb for every `fetch` request
 *
 * Note that tracing Http headers are only attached if the url matches the specified `tracePropagationTargets`
 * entries to avoid CORS errors.
 *
 * @param origLoad SvelteKit user defined load function
 */
// The liberal generic typing of `T` is necessary because we cannot let T extend `Load`.
// This function needs to tell TS that it returns exactly the type that it was called with
// because SvelteKit generates the narrowed down `PageLoad` or `LayoutLoad` types
// at build time for every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapLoadWithSentry<T extends (...args: any) => any>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `Load` (see comment above function signature)
      const event = args[0] as PatchedLoadEvent;

      // Check if already wrapped
      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedEvent: PatchedLoadEvent = {
        ...event,
      };

      addNonEnumerableProperty(patchedEvent, '__sentry_wrapped__', true);

      const routeId = getRouteId(event);
      const routeOrPathname = routeId ? routeId : event.url.pathname;

      const client = getClient();
      const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

      return startSpan(
        {
          // With span streaming, span names have to be low cardinality, so we use the function name.
          name: hasSpanStreaming ? 'load' : routeOrPathname,
          attributes: {
            [SENTRY_OP]: FUNCTION,
            [CODE_FUNCTION_NAME]: 'load',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SENTRY_SEGMENT_NAME_SOURCE]: routeId ? 'route' : 'url',
            [URL_PATH]: event.url.pathname,
            ...(routeId && { [URL_TEMPLATE]: routeId }),
            // Relay infers the description from `code.function.name`, which would drop the route.
            ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: routeOrPathname }),
          },
        },
        () => handleCallbackErrors(() => wrappingTarget.apply(thisArg, [patchedEvent]), sendErrorToSentry),
      );
    },
  });
}
