import type { H3Event } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { addSentryTracingMetaTags, shouldAddTracingMetaTags } from '../utils';

export default (nitroApp => {
  nitroApp.hooks.hook('error', sentryCaptureErrorHook);

  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
    if (shouldAddTracingMetaTags(event)) {
      addSentryTracingMetaTags(html.head);
    }
  });
}) satisfies NitroAppPlugin;
