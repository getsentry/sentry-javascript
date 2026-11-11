import type { SerializedTraceData } from '@sentry/core';
import { debug, getTraceData, GLOBAL_OBJ } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { addSentryTracingMetaTags, getEventRequestInfo } from '../utils';
import { CACHE_ORIGIN_META_TAG_NAME } from './cacheOriginMetaTag';

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
 * trace of the render. The tag is empty for build prerenders, because the SDK does not run in the build.
 */
export function addSentryPageMetaTags(
  head: NuxtRenderHTMLContext['head'],
  event: H3Event,
  traceData?: SerializedTraceData,
): void {
  const cacheOrigin = getCacheOrigin(event, traceData);
  if (cacheOrigin === undefined) {
    addSentryTracingMetaTags(head, traceData);
    return;
  }

  debug.log(`Adding the Sentry cache origin meta tag to the reused page ${getEventRequestInfo(event).path}.`);
  head.push(`<meta name="${CACHE_ORIGIN_META_TAG_NAME}" content="${cacheOrigin}"/>`);
}

/** The `sentry-trace` value of the render of a reused page, or `undefined` for a page rendered per request. */
function getCacheOrigin(event: H3Event, traceData: SerializedTraceData | undefined): string | undefined {
  if (isPrerenderRequest(event)) {
    return '';
  }
  if (!isCachedRoute(event)) {
    return undefined;
  }
  return (traceData ?? getTraceData())['sentry-trace'] ?? '';
}

// The Nitro prerenderer sends this header with each route it renders (Nitro v2 and v3).
function isPrerenderRequest(event: H3Event): boolean {
  const { node, req } = event as unknown as {
    node?: { req?: { headers?: Record<string, unknown> } };
    req?: { headers?: Headers };
  };
  // Check `node` first: in h3 v1, `req` is a deprecated alias of the Node request, not a web `Request`.
  if (node?.req) {
    return !!node.req.headers?.['x-nitro-prerender'];
  }
  return !!req?.headers?.get('x-nitro-prerender');
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
