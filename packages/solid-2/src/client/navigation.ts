import { getAbsoluteUrl, startBrowserTracingNavigationSpan } from '@sentry/browser';
import { PARAMS_KEY_BASE, URL_PATH_PARAMETER_KEY_BASE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import type { Client, Span, SpanAttributes, SpanLink } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import type { HoldEvent, NavigationEvent } from 'solid-js/attribution';
import { describeOrigin } from '../common/target';
import { epochSeconds, round } from '../common/time';

export const ORIGIN = 'auto.ui.solid.attribution';
const NAVIGATION_ORIGIN = 'auto.navigation.solid';

export function holdSpan(hold: HoldEvent, parent: Span | null): Span {
  const span = startInactiveSpan({
    name: `hold${hold.blockers.length ? ` waiting on ${hold.blockers.join(', ')}` : ''}`,
    op: 'solid.hold',
    parentSpan: parent,
    startTime: epochSeconds(hold.at),
    attributes: {
      'solid.hold.ms': round(hold.holdMs),
      'solid.hold.tailMs': round(hold.tailMs),
      'solid.hold.flushes': hold.flushes,
      'solid.hold.silent': hold.silent,
      'solid.hold.long': hold.long,
      'solid.hold.acknowledgedBy': hold.acknowledgements.map(a => `${a.kind}:${a.source}`),
      'solid.hold.readers': hold.acknowledgements.flatMap(a => (a.reader ? [a.reader.join(' › ')] : [])),
      'solid.hold.blockers': hold.blockers,
      'solid.hold.heldWrites': hold.heldWrites.map(w => w.name),
      'solid.hold.painted': hold.paintedDuringHold,
      'solid.hold.action': hold.action,
      'solid.hold.navigation': hold.origin ? describeOrigin(hold.origin) : undefined,
      'sentry.origin': ORIGIN,
    },
  });
  span.end(epochSeconds(hold.at + hold.holdMs));
  return span;
}

/**
 * The route's parameters as span attributes, under both keys the browser
 * SDKs' router integrations write (`url.path.parameter.id`, `params.id`).
 */
function routeParamAttributes(params: NavigationEvent['params']): SpanAttributes {
  const attributes: SpanAttributes = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      attributes[`${URL_PATH_PARAMETER_KEY_BASE}.${key}`] = value;
      attributes[`${PARAMS_KEY_BASE}.${key}`] = value;
    }
  }
  return attributes;
}

function navigationAttributes(nav: NavigationEvent): SpanAttributes {
  return {
    'solid.navigation.to': nav.to,
    'solid.navigation.from': nav.from,
    'solid.navigation.outcome': nav.outcome,
    'solid.navigation.writes': nav.writes,
    'solid.navigation.redirects': nav.redirects?.map(h => h.to ?? h.name ?? '?'),
    'solid.navigation.silent': nav.hold?.silent ?? false,
    ...routeParamAttributes(nav.params),
  };
}

/** What a navigation span gets before it ends: its hold, and whatever the caller has for it (its calls). */
function fill(span: Span, nav: NavigationEvent, children: ((span: Span) => void) | undefined): Span {
  if (nav.hold !== undefined) holdSpan(nav.hold, span);
  children?.(span);
  span.end(epochSeconds(nav.at + (nav.settledMs ?? 0)));
  return span;
}

/** The record as a span of its own — no browser navigation span to be. */
export function navigationSpan(
  nav: NavigationEvent,
  parent: Span | null,
  links?: SpanLink[],
  children?: (span: Span) => void,
): Span {
  const span = startInactiveSpan({
    name: nav.name ?? nav.to ?? 'navigation',
    op: 'navigation',
    parentSpan: parent,
    startTime: epochSeconds(nav.at),
    attributes: { ...navigationAttributes(nav), 'sentry.origin': ORIGIN },
    links,
  });
  return fill(span, nav, children);
}

/**
 * The record as the browser SDK's `navigation` span — the transaction
 * Sentry's Performance product names pages by. Started through the same
 * door the history hook would have used (`startBrowserTracingNavigationSpan`:
 * a new trace, the previous idle span ended, `beforeStartSpan` and the
 * client hooks honoured), dated from the write that requested it, and ended
 * where the runtime settled it: the transition committed and its holds
 * landed. The browser SDK's idle timeout exists for frameworks that cannot
 * say when a navigation is over; this one can. Without a route pattern the
 * name is the path — or the fallback under span streaming, where names must
 * be low-cardinality. `undefined` when no span was started for this client
 * (another client is current; tracing disabled), so the caller falls back.
 */
export function browserNavigationSpan(
  client: Client,
  nav: NavigationEvent,
  links?: SpanLink[],
  children?: (span: Span) => void,
): Span | undefined {
  const active = getActiveSpan();
  const before = active === undefined ? undefined : getRootSpan(active);
  const name = nav.name ?? (hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : nav.to);
  const span = startBrowserTracingNavigationSpan(
    client,
    {
      name: name ?? NAVIGATION_SPAN_NAME_FALLBACK,
      startTime: epochSeconds(nav.at),
      attributes: {
        ...navigationAttributes(nav),
        [SENTRY_SEGMENT_NAME_SOURCE]: nav.name !== undefined ? 'route' : 'url',
        [URL_TEMPLATE]: nav.name,
        'sentry.origin': NAVIGATION_ORIGIN,
      },
      links,
    },
    nav.to !== undefined ? { url: getAbsoluteUrl(nav.to) } : undefined,
  );
  // `startBrowserTracingNavigationSpan` answers with whatever idle span is
  // active; only one that appeared for this call is ours to fill and end.
  if (
    span === undefined ||
    span === before ||
    spanToJSON(span).attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'navigation'
  ) {
    return undefined;
  }
  return fill(span, nav, children);
}

/**
 * The route the document arrived on names the `pageload` span: the same
 * rename every router integration performs, from the record instead of the
 * router. Nothing without a route pattern — the URL the span already has is
 * the best name there is — or without an active `pageload` (tracing without
 * the browser integration, a record after the span ended).
 */
export function nameInitialRoute(nav: NavigationEvent): void {
  const name = nav.name;
  if (name === undefined) return;
  const active = getActiveSpan();
  if (active === undefined) return;
  const root = getRootSpan(active);
  if (spanToJSON(root).attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'pageload') return;
  root.updateName(name);
  root.setAttributes({
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    [URL_TEMPLATE]: name,
    ...routeParamAttributes(nav.params),
  });
  // The scope's transaction name is what error events on this page carry.
  getCurrentScope().setTransactionName(name);
}
