import { HTTP_ROUTE, SENTRY_OP } from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import type { PropagationContext, RawAttributes, Span } from '@sentry/core';
import { isObjectLike, Scope, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { ATTR_NEXT_SEGMENT, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';

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
  if (isObjectLike(commonObject)) {
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
  if (isObjectLike(commonObject)) {
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

/**
 * Checks if the span is a resolve segment span.
 * @param spanAttributes The attributes of the span to check.
 * @returns True if the span is a resolve segment span, false otherwise.
 */
export function isResolveSegmentSpan(spanAttributes: RawAttributes<Record<string, unknown>>): boolean {
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
  spanAttributes: RawAttributes<Record<string, unknown>>,
  rootSpanAttributes: RawAttributes<Record<string, unknown>>,
): void {
  if (!isResolveSegmentSpan(spanAttributes)) {
    return;
  }

  const segment = spanAttributes[ATTR_NEXT_SEGMENT] as string;
  const route = rootSpanAttributes[HTTP_ROUTE];
  const enhancedName = getEnhancedResolveSegmentSpanName({ segment, route: typeof route === 'string' ? route : '' });
  activeSpan.updateName(enhancedName);
  activeSpan.setAttributes({
    'sentry.nextjs.ssr.function.type': segment === PAGE_SEGMENT ? 'Page' : 'Layout',
    'sentry.nextjs.ssr.function.route': route as string | undefined,
    [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
  });
}
