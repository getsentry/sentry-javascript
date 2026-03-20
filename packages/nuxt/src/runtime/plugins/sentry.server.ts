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
    const headers = event.node.res?.getHeaders() || {};

    const isPreRenderedPage = Object.keys(headers).includes('x-nitro-prerender');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const isSWRCachedPage = event?.context?.cache?.options.swr as boolean | undefined;

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
