import type { SerializedTraceData } from '@sentry/core';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import { _INTERNAL_getCacheOriginMetaTag, _INTERNAL_getRootSpanSentryTrace } from '@sentry/core/server';
import type { H3Event } from 'h3';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { addSentryTracingMetaTags, getEventRequestInfo } from '../utils';

/** Global flag set by the generated runtime-flags module to the Nitro preset of the server build. */
export const NUXT_NITRO_PRESET_FLAG = '__SENTRY_NUXT_NITRO_PRESET__';

// Presets on which a platform cache serves `isr` pages. On all other presets (also `vercel-edge` and
// `netlify-edge`), Nitro ignores `isr` and renders the page for each request.
const PLATFORM_ISR_PRESETS = new Set(['vercel', 'netlify', 'netlify-legacy', 'netlify-builder']);

interface RouteRulesContext {
  // Nitro v2: the Nuxt renderer writes the merged rules here before `render:html`.
  _nitro?: { routeRules?: RouteRules };
  // Nitro v3: the rules by name, without the rules set to `false`.
  routeRules?: RouteRules;
}

interface RouteRules {
  cache?: unknown;
  isr?: unknown;
}

/**
 * Adds the Sentry meta tags to a rendered page. A page that other visitors get too has a
 * `sentry-cache-origin` tag instead of `sentry-trace` and `baggage`, so that no visitor continues the
 * trace of the render.
 */
export function addSentryPageMetaTags(
  head: NuxtRenderHTMLContext['head'],
  event: H3Event,
  traceData?: SerializedTraceData,
): void {
  const isPrerender = isPrerenderRequest(event);
  if (!isPrerender && !isCachedRoute(event)) {
    addSentryTracingMetaTags(head, traceData);
    return;
  }

  debug.log(`Adding the Sentry cache origin meta tag to the reused page ${getEventRequestInfo(event).path}.`);
  // Sentry skips its server init in the prerender build, so a prerendered page has no trace to link.
  const renderTrace = isPrerender ? undefined : (traceData?.['sentry-trace'] ?? _INTERNAL_getRootSpanSentryTrace());
  head.push(_INTERNAL_getCacheOriginMetaTag(renderTrace));
}

// The Nitro prerenderer sends this header with each route it renders (Nitro v2 and v3). h3 v2 deprecates
// `event.headers`, so a later h3 can remove it. Then the page gets the live tags and does not fail.
function isPrerenderRequest(event: H3Event): boolean {
  return !!event.headers?.has?.('x-nitro-prerender');
}

// Nitro changes `swr` rules into `cache` rules, so `cache` covers both.
function isCachedRoute(event: H3Event): boolean {
  const context = event.context as RouteRulesContext | undefined;
  const routeRules = context?._nitro?.routeRules ?? context?.routeRules;
  return !!routeRules?.cache || (!!routeRules?.isr && hasPlatformIsr());
}

function hasPlatformIsr(): boolean {
  const preset = (GLOBAL_OBJ as typeof GLOBAL_OBJ & { [NUXT_NITRO_PRESET_FLAG]?: unknown })[NUXT_NITRO_PRESET_FLAG];
  return typeof preset === 'string' && PLATFORM_ISR_PRESETS.has(preset);
}
