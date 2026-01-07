import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { PropagationContext, Span, SpanAttributes } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getRootSpan,
  GLOBAL_OBJ,
  Scope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  spanToJSON,
  startNewTrace,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { ATTR_NEXT_SEGMENT, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';

const commonPropagationContextMap = new WeakMap<object, PropagationContext>();

const PAGE_SEGMENT = '__PAGE__';

/**
 * Takes a shared (garbage collectable) object between resources, e.g. a headers object shared between Next.js server components and returns a common propagation context.
 *
 * @param commonObject The shared object.
 * @param propagationContext The propagation context that should be shared between all the resources if no propagation context was registered yet.
 * @returns the shared propagation context.
 */
export function commonObjectToPropagationContext(
  commonObject: unknown,
  propagationContext: PropagationContext,
): PropagationContext {
  if (typeof commonObject === 'object' && commonObject) {
    const memoPropagationContext = commonPropagationContextMap.get(commonObject);
    if (memoPropagationContext) {
      return memoPropagationContext;
    } else {
      commonPropagationContextMap.set(commonObject, propagationContext);
      return propagationContext;
    }
  } else {
    return propagationContext;
  }
}

const commonIsolationScopeMap = new WeakMap<object, Scope>();

/**
 * Takes a shared (garbage collectable) object between resources, e.g. a headers object shared between Next.js server components and returns a common propagation context.
 *
 * @param commonObject The shared object.
 * @param isolationScope The isolationScope that should be shared between all the resources if no isolation scope was created yet.
 * @returns the shared isolation scope.
 */
export function commonObjectToIsolationScope(commonObject: unknown): Scope {
  if (typeof commonObject === 'object' && commonObject) {
    const memoIsolationScope = commonIsolationScopeMap.get(commonObject);
    if (memoIsolationScope) {
      return memoIsolationScope;
    } else {
      const newIsolationScope = new Scope();
      commonIsolationScopeMap.set(commonObject, newIsolationScope);
      return newIsolationScope;
    }
  } else {
    return new Scope();
  }
}

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

let nextjsEscapedAsyncStorage: AsyncLocalStorage<true>;

/**
 * Will mark the execution context of the callback as "escaped" from Next.js internal tracing by unsetting the active
 * span and propagation context. When an execution passes through this function multiple times, it is a noop after the
 * first time.
 */
export function escapeNextjsTracing<T>(cb: () => T): T {
  const MaybeGlobalAsyncLocalStorage = (GLOBAL_OBJ as { AsyncLocalStorage?: new () => AsyncLocalStorage<true> })
    .AsyncLocalStorage;

  if (!MaybeGlobalAsyncLocalStorage) {
    DEBUG_BUILD &&
      debug.warn(
        "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
      );
    return cb();
  }

  if (!nextjsEscapedAsyncStorage) {
    nextjsEscapedAsyncStorage = new MaybeGlobalAsyncLocalStorage();
  }

  if (nextjsEscapedAsyncStorage.getStore()) {
    return cb();
  } else {
    return startNewTrace(() => {
      return nextjsEscapedAsyncStorage.run(true, () => {
        return cb();
      });
    });
  }
}

/**
 * Ideally this function never lands in the develop branch.
 *
 * Drops the entire span tree this function was called in, if it was a span tree created by Next.js.
 */
export function dropNextjsRootContext(): void {
  const nextJsOwnedSpan = getActiveSpan();
  if (nextJsOwnedSpan) {
    const rootSpan = getRootSpan(nextJsOwnedSpan);
    const rootSpanAttributes = spanToJSON(rootSpan).data;
    if (rootSpanAttributes?.['next.span_type']) {
      getRootSpan(nextJsOwnedSpan)?.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    }
  }
}

/**
 * Checks if the span is a resolve segment span.
 * @param spanAttributes The attributes of the span to check.
 * @returns True if the span is a resolve segment span, false otherwise.
 */
export function isResolveSegmentSpan(spanAttributes: SpanAttributes): boolean {
  return (
    spanAttributes[ATTR_NEXT_SPAN_TYPE] === 'NextNodeServer.getLayoutOrPageModule' &&
    spanAttributes[ATTR_NEXT_SPAN_NAME] === 'resolve segment modules' &&
    typeof spanAttributes[ATTR_NEXT_SEGMENT] === 'string'
  );
}

/**
 * Returns the enhanced name for a resolve segment span.
 * @param segment The segment of the resolve segment span.
 * @param route The route of the resolve segment span.
 * @returns The enhanced name for the resolve segment span.
 */
export function getEnhancedResolveSegmentSpanName({ segment, route }: { segment: string; route: string }): string {
  if (segment === PAGE_SEGMENT) {
    return `resolve page server component "${route}"`;
  }

  if (segment === '') {
    return 'resolve root layout server component';
  }

  return `resolve layout server component "${segment}"`;
}

/**
 * Maybe enhances the span name for a resolve segment span.
 * If the span is not a resolve segment span, this function does nothing.
 * @param activeSpan The active span.
 * @param spanAttributes The attributes of the span to check.
 * @param rootSpanAttributes The attributes of the according root span.
 */
export function maybeEnhanceServerComponentSpanName(
  activeSpan: Span,
  spanAttributes: SpanAttributes,
  rootSpanAttributes: SpanAttributes,
): void {
  if (!isResolveSegmentSpan(spanAttributes)) {
    return;
  }

  const segment = spanAttributes[ATTR_NEXT_SEGMENT] as string;
  const route = rootSpanAttributes[ATTR_HTTP_ROUTE];
  const enhancedName = getEnhancedResolveSegmentSpanName({ segment, route: typeof route === 'string' ? route : '' });
  activeSpan.updateName(enhancedName);
  activeSpan.setAttributes({
    'sentry.nextjs.ssr.function.type': segment === PAGE_SEGMENT ? 'Page' : 'Layout',
    'sentry.nextjs.ssr.function.route': route,
  });
  activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'function.nextjs');
}
