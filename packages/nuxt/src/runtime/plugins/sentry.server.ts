import { debug } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags } from '../utils';

export default (nitroApp => {
  nitroApp.hooks.hook('beforeResponse', updateRouteBeforeResponse);

  nitroApp.hooks.hook('error', sentryCaptureErrorHook);

  // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
    // h3 v1 (Nuxt 4): event.node.res.getHeaders(); h3 v2 (Nuxt 5): event.node is undefined
    const nodeResHeadersH3v1 = event.node?.res?.getHeaders() || {};

    // h3 v2 (Nuxt 5): response headers are on event.res.headers
    const isPreRenderedPage =
      Object.keys(nodeResHeadersH3v1).includes('x-nitro-prerender') ||
      // fix   × typescript-eslint(no-unsafe-member-access): Unsafe member access .res on an `any` value.
      // oxlint-disable-next-line typescript/no-explicit-any,typescript-oxlint/no-unsafe-member-access
      !!(event as any).res?.headers?.has?.('x-nitro-prerender');

    // oxlint-disable-next-line typescript-oxlint/no-unsafe-member-access
    const isSWRCachedPage = event?.context?.cache?.options?.swr as boolean | undefined;

    if (!isPreRenderedPage && !isSWRCachedPage) {
      addSentryTracingMetaTags(html.head);
    } else {
      const reason = isPreRenderedPage ? 'the page was pre-rendered' : 'SWR caching is enabled for the route';
      debug.log(
        `Not adding Sentry tracing meta tags to HTML for ${event.path} because ${reason}. This will disable distributed tracing and prevent connecting multiple client page loads to the same server request.`,
      );
    }
  });
}) satisfies NitroAppPlugin;
